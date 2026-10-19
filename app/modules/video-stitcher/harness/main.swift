// macOS harness for app/modules/video-stitcher/ios/VideoStitcher.swift (the AVFoundation core).
// Makes synthetic camera-like segments (H.264 + AAC in .mov, with rotation and mirroring transforms
// like an iPhone's back and front camera), stitches them with the module's own code, and checks the
// result: container, codecs, size, duration, frame count, audio continuity, moov before mdat, and
// that every segment is shown the way it was recorded.
import AVFoundation
import CoreImage
import Foundation

setbuf(stdout, nil) // results survive a crash
let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

struct SegmentSpec {
  let name: String
  let seconds: Double
  /// Stored buffer size (what the encoder sees).
  let width: Int
  let height: Int
  let transform: CGAffineTransform
  let toneHz: Double
  let withAudio: Bool
  var noise = false
}

/// The picture as shown: top half red, bottom-left green, bottom-right blue.
/// The stored buffer is drawn so that applying `transform` shows that picture.
func makeSegment(_ spec: SegmentSpec) async throws -> URL {
  let url = dir.appendingPathComponent("\(spec.name).mov")
  try? FileManager.default.removeItem(at: url)
  let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
  let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: spec.width, AVVideoHeightKey: spec.height,
  ])
  video.transform = spec.transform
  video.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: spec.width, kCVPixelBufferHeightKey as String: spec.height,
  ])
  writer.add(video)
  var audio: AVAssetWriterInput?
  if spec.withAudio {
    let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000,
    ])
    a.expectsMediaDataInRealTime = false
    writer.add(a)
    audio = a
  }
  guard writer.startWriting() else { throw writer.error! }
  writer.startSession(atSourceTime: .zero)

  // The upright picture, then the inverse of the transform gives the stored buffer.
  let shown = CGRect(x: 0, y: 0, width: spec.width, height: spec.height).applying(spec.transform)
  let shownSize = CGSize(width: abs(shown.width), height: abs(shown.height))
  let picture = CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: CGRect(x: 0, y: shownSize.height / 2, width: shownSize.width, height: shownSize.height / 2))
    .composited(over: CIImage(color: CIColor(red: 0, green: 1, blue: 0)).cropped(to: CGRect(x: 0, y: 0, width: shownSize.width / 2, height: shownSize.height / 2)))
    .composited(over: CIImage(color: CIColor(red: 0, green: 0, blue: 1)).cropped(to: CGRect(x: shownSize.width / 2, y: 0, width: shownSize.width / 2, height: shownSize.height / 2)))
  // CoreImage is y-up; video transforms are y-down. Flip into y-down, undo the transform, flip back.
  let flipShown = CGAffineTransform(scaleX: 1, y: -1).translatedBy(x: 0, y: -shownSize.height)
  let toOrigin = CGAffineTransform(translationX: -shown.minX, y: -shown.minY)
  let forward = spec.transform.concatenating(toOrigin) // stored (y-down) -> shown (y-down)
  let flipStored = CGAffineTransform(scaleX: 1, y: -1).translatedBy(x: 0, y: -CGFloat(spec.height))
  let storedImage = picture.transformed(by: flipShown.concatenating(forward.inverted()).concatenating(flipStored))
  let context = CIContext()

  let fps = 30
  let frames = Int(spec.seconds * Double(fps))
  let queue = DispatchQueue(label: "video")
  let group = DispatchGroup()
  group.enter()
  do {
    var i = 0
    video.requestMediaDataWhenReady(on: queue) {
      while video.isReadyForMoreMediaData {
        if i >= frames { video.markAsFinished(); group.leave(); i += 1; return }
        if i > frames { return }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
        if spec.noise {
          // Camera-like detail in motion: a moving checkerboard with 25% noise over it.
          let moved = CGAffineTransform(translationX: CGFloat(i * 7), y: CGFloat(i * 3))
          let checker = CIFilter(name: "CICheckerboardGenerator", parameters: ["inputWidth": 40, "inputColor0": CIColor.white, "inputColor1": CIColor(red: 0.2, green: 0.4, blue: 0.8)])!.outputImage!
          let n = CIFilter(name: "CIRandomGenerator")!.outputImage!.transformed(by: moved).applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.25)])
          context.render(n.composited(over: checker.transformed(by: moved)).cropped(to: CGRect(x: 0, y: 0, width: spec.width, height: spec.height)), to: pb!)
        } else {
          context.render(storedImage, to: pb!)
        }
        adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(fps)))
        i += 1
      }
    }
  }
  if let audio {
    group.enter()
    let rate = 44_100.0
    let total = Int(spec.seconds * rate)
    let chunk = 1024
    var asbd = AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
                                           mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
    var format: CMAudioFormatDescription?
    CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format)
    do {
      var pos = 0
      var done = false
      audio.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
        while audio.isReadyForMoreMediaData && !done {
          if pos >= total { audio.markAsFinished(); done = true; group.leave(); return }
          let n = min(chunk, total - pos)
          var samples = [Int16](repeating: 0, count: n)
          for k in 0..<n { samples[k] = Int16(8000 * sin(2 * Double.pi * spec.toneHz * Double(pos + k) / rate)) }
          var block: CMBlockBuffer?
          CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: n * 2, blockAllocator: nil, customBlockSource: nil, offsetToData: 0, dataLength: n * 2, flags: 0, blockBufferOut: &block)
          samples.withUnsafeBytes { raw in _ = CMBlockBufferReplaceDataBytes(with: raw.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: n * 2) }
          var sb: CMSampleBuffer?
          CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block!, formatDescription: format!, sampleCount: n, presentationTimeStamp: CMTime(value: CMTimeValue(pos), timescale: 44_100), packetDescriptions: nil, sampleBufferOut: &sb)
          audio.append(sb!)
          pos += n
        }
      }
    }
  }
  await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in group.notify(queue: .global()) { c.resume() } }
  await writer.finishWriting()
  guard writer.status == .completed else { throw writer.error ?? NSError(domain: "harness", code: 1) }
  return url
}

/// Colour of the shown picture at relative point (x, y) from the top-left.
func colour(at url: URL, time: Double, x: Double, y: Double) async throws -> String {
  let asset = AVURLAsset(url: url)
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = .zero
  let (cg, _) = try await gen.image(at: CMTime(seconds: time, preferredTimescale: 600))
  let ci = CIImage(cgImage: cg)
  let px = CGFloat(x) * CGFloat(cg.width), py = CGFloat(1 - y) * CGFloat(cg.height)
  var rgba = [UInt8](repeating: 0, count: 4)
  CIContext().render(ci, toBitmap: &rgba, rowBytes: 4, bounds: CGRect(x: px, y: py, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
  let (r, g, b) = (Int(rgba[0]), Int(rgba[1]), Int(rgba[2]))
  if r > 150 && g < 100 && b < 100 { return "red" }
  if g > 150 && r < 100 && b < 100 { return "green" }
  if b > 150 && r < 100 && g < 100 { return "blue" }
  return "rgb(\(r),\(g),\(b))"
}

func topLevelBoxes(_ url: URL) throws -> [String] {
  let data = try Data(contentsOf: url)
  var boxes: [String] = []
  var offset = 0
  while offset + 8 <= data.count {
    var size = Int(data[offset..<offset + 4].reduce(0) { $0 << 8 | UInt64($1) })
    let type = String(bytes: data[offset + 4..<offset + 8], encoding: .ascii) ?? "?"
    if size == 1 { size = Int(data[offset + 8..<offset + 16].reduce(0) { $0 << 8 | UInt64($1) }) }
    if size == 0 { size = data.count - offset }
    boxes.append(type)
    offset += size
  }
  return boxes
}

var failures = 0
func check(_ ok: Bool, _ what: String) {
  print(ok ? "PASS" : "FAIL", what)
  if !ok { failures += 1 }
}

let rotate90 = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0) // back camera, portrait: 1920x1080 stored
let rotate90Mirrored = CGAffineTransform(a: 0, b: 1, c: 1, d: 0, tx: 0, ty: 0) // front camera, mirrored, portrait
let specs = [
  SegmentSpec(name: "seg1-back", seconds: 3, width: 1920, height: 1080, transform: rotate90, toneHz: 440, withAudio: true),
  SegmentSpec(name: "seg2-front-mirrored", seconds: 2, width: 1920, height: 1080, transform: rotate90Mirrored, toneHz: 660, withAudio: true),
  SegmentSpec(name: "seg3-upright", seconds: 1.5, width: 1080, height: 1920, transform: .identity, toneHz: 880, withAudio: true),
  SegmentSpec(name: "seg4-720p-back", seconds: 1, width: 1280, height: 720, transform: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 720, ty: 0), toneHz: 330, withAudio: true),
]

do {
  var urls: [URL] = []
  for s in specs { urls.append(try await makeSegment(s)) }
  // The source segments as shown.
  for (s, u) in zip(specs, urls) {
    let top = try await colour(at: u, time: 0.5, x: 0.5, y: 0.2)
    let left = try await colour(at: u, time: 0.5, x: 0.2, y: 0.8)
    let right = try await colour(at: u, time: 0.5, x: 0.8, y: 0.8)
    print("source \(s.name): top \(top), bottom-left \(left), bottom-right \(right)")
  }

  let out = dir.appendingPathComponent("stitched.mp4")
  try? FileManager.default.removeItem(at: out)
  let started = Date()
  try await VideoStitcher.stitch(urls, to: out)
  print(String(format: "stitched in %.2f s", Date().timeIntervalSince(started)))

  let asset = AVURLAsset(url: out, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let duration = try await asset.load(.duration).seconds
  let expected = specs.reduce(0) { $0 + $1.seconds }
  check(abs(duration - expected) < 0.05, String(format: "duration %.3f s (expected %.3f)", duration, expected))
  let v = try await asset.loadTracks(withMediaType: .video)
  let a = try await asset.loadTracks(withMediaType: .audio)
  check(v.count == 1 && a.count == 1, "one video and one audio track (\(v.count), \(a.count))")
  let (size, transform, vfmt) = try await v[0].load(.naturalSize, .preferredTransform, .formatDescriptions)
  check(size == CGSize(width: 1080, height: 1920), "video \(Int(size.width))x\(Int(size.height)), upright, first segment's frame")
  check(transform == .identity, "identity transform (orientation baked in)")
  check(CMFormatDescriptionGetMediaSubType(vfmt[0]) == kCMVideoCodecType_H264, "H.264")
  let afmt = try await a[0].load(.formatDescriptions)
  check(CMFormatDescriptionGetMediaSubType(afmt[0]) == kAudioFormatMPEG4AAC, "AAC")
  let aRange = try await a[0].load(.timeRange)
  check(abs(aRange.duration.seconds - expected) < 0.1, String(format: "audio spans %.3f s", aRange.duration.seconds))
  let rate = try await v[0].load(.estimatedDataRate)
  print(String(format: "video data rate %.2f Mbps (target 2.5; synthetic flat colour compresses far below it)", rate / 1_000_000))

  // Frames: decode all and count, check timestamps increase.
  let reader = try AVAssetReader(asset: asset)
  let ro = AVAssetReaderTrackOutput(track: v[0], outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  reader.add(ro)
  reader.startReading()
  var count = 0
  var last = CMTime.negativeInfinity
  var monotonic = true
  while let sb = ro.copyNextSampleBuffer() {
    let pts = CMSampleBufferGetPresentationTimeStamp(sb)
    if pts <= last { monotonic = false }
    last = pts
    count += 1
  }
  check(abs(count - Int(expected * 30)) <= 2, "\(count) frames at 30 fps (expected \(Int(expected * 30)))")
  check(monotonic, "presentation timestamps increase")

  let boxes = try topLevelBoxes(out)
  print("top-level boxes: \(boxes.joined(separator: " "))")
  if let moov = boxes.firstIndex(of: "moov"), let mdat = boxes.firstIndex(of: "mdat") {
    check(moov < mdat, "moov before mdat (fast start)")
  } else {
    check(false, "moov and mdat present")
  }

  // Each segment shown as recorded.
  var t = 0.0
  for (s, u) in zip(specs, urls) {
    let mid = t + s.seconds / 2
    for (x, y, label) in [(0.5, 0.2, "top"), (0.2, 0.8, "bottom-left"), (0.8, 0.8, "bottom-right")] {
      let want = try await colour(at: u, time: s.seconds / 2, x: x, y: y)
      let got = try await colour(at: out, time: mid, x: x, y: y)
      check(want == got, "\(s.name) \(label): \(got) (source \(want))")
    }
    t += s.seconds
  }

  // Pause and Resume (19 Oct 2026): a take of many short segments, cameras alternating, each with its
  // own tone. The stitched clip is the sum of the segments (no paused time exists in the files), and
  // the sound changes tone at each join within a frame or two of the picture: picture and sound stay
  // in step across every join, not only overall.
  let pauseSpecs: [SegmentSpec] = [0.7, 1.3, 2.0, 0.9, 3.1, 1.6, 0.8, 2.4, 1.1, 1.9].enumerated().map { i, secs in
    SegmentSpec(name: "pause\(i + 1)", seconds: secs, width: 1920, height: 1080, transform: i % 2 == 0 ? rotate90Mirrored : rotate90,
                toneHz: [300.0, 500, 700, 900, 1100][i % 5], withAudio: true)
  }
  var pauseUrls: [URL] = []
  for s in pauseSpecs { pauseUrls.append(try await makeSegment(s)) }
  let pauseOut = dir.appendingPathComponent("stitched-pause-resume.mp4")
  try? FileManager.default.removeItem(at: pauseOut)
  let tp = Date()
  try await VideoStitcher.stitch(pauseUrls, to: pauseOut)
  print(String(format: "10 pause/resume segments stitched in %.2f s", Date().timeIntervalSince(tp)))
  let pAsset = AVURLAsset(url: pauseOut, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
  let pExpected = pauseSpecs.reduce(0) { $0 + $1.seconds }
  let pDuration = try await pAsset.load(.duration).seconds
  check(abs(pDuration - pExpected) < 0.05, String(format: "pause/resume: duration %.3f s (expected %.3f, the recorded segments only)", pDuration, pExpected))
  let pv = try await pAsset.loadTracks(withMediaType: .video)
  let pa = try await pAsset.loadTracks(withMediaType: .audio)
  check(pv.count == 1 && pa.count == 1, "pause/resume: one video and one audio track")
  let paRange = try await pa[0].load(.timeRange)
  check(abs(paRange.duration.seconds - pExpected) < 0.1, String(format: "pause/resume: sound spans %.3f s", paRange.duration.seconds))
  // Frames.
  let pReader = try AVAssetReader(asset: pAsset)
  let pro = AVAssetReaderTrackOutput(track: pv[0], outputSettings: nil)
  pReader.add(pro)
  pReader.startReading()
  var pFrames = 0
  var pPts: [Double] = []
  while let sb = pro.copyNextSampleBuffer() { pFrames += 1; pPts.append(CMSampleBufferGetPresentationTimeStamp(sb).seconds) }
  pPts.sort()
  let gaps = zip(pPts.dropFirst(), pPts).map { $0 - $1 }
  let short = gaps.enumerated().filter { $0.element < 0.030 }.map { String(format: "%.3f s (+%.1f ms)", pPts[$0.offset], $0.element * 1000) }
  if !short.isEmpty { print("pause/resume: short frame intervals at \(short.joined(separator: ", "))") }
  // The composition draws at 30 fps; where a join falls between two grid points it can add one frame.
  let sourceFrames = Int((pExpected * 30).rounded())
  check(pFrames >= sourceFrames && pFrames <= sourceFrames + pauseSpecs.count - 1, "pause/resume: \(pFrames) frames for \(sourceFrames) recorded (at most one extra per join)")
  check((gaps.max() ?? 1) < 0.040, String(format: "pause/resume: no frame gap longer than %.1f ms (no frozen picture at a join)", (gaps.max() ?? 1) * 1000))
  // The sound, decoded to 16-bit mono at 44.1 kHz.
  let aReader = try AVAssetReader(asset: pAsset)
  let aro = AVAssetReaderTrackOutput(track: pa[0], outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
  ])
  aReader.add(aro)
  aReader.startReading()
  var pcm: [Int16] = []
  var firstPts: Double?
  while let sb = aro.copyNextSampleBuffer() {
    if firstPts == nil { firstPts = CMSampleBufferGetPresentationTimeStamp(sb).seconds }
    guard let block = CMSampleBufferGetDataBuffer(sb) else { continue }
    let len = CMBlockBufferGetDataLength(block)
    var chunk = [Int16](repeating: 0, count: len / 2)
    chunk.withUnsafeMutableBytes { raw in _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: len, destination: raw.baseAddress!) }
    pcm.append(contentsOf: chunk)
  }
  let start = firstPts ?? 0
  /// The tone in the 10 ms window at `t` (zero crossings), or 0 for silence.
  func tone(at t: Double) -> Double {
    let from = Int(((t - start) * 44_100).rounded())
    let n = 441
    guard from >= 0, from + n < pcm.count else { return 0 }
    var crossings = 0
    var loud = false
    for k in from..<(from + n - 1) {
      if (pcm[k] < 0) != (pcm[k + 1] < 0) { crossings += 1 }
      if abs(Int(pcm[k])) > 2000 { loud = true }
    }
    return loud ? Double(crossings) / 2 / 0.01 : 0
  }
  func near(_ f: Double, _ hz: Double) -> Bool { abs(f - hz) < hz * 0.15 }
  var joinErrors: [Double] = []
  var middlesOk = true
  var cursor = 0.0
  for (i, s) in pauseSpecs.enumerated() {
    if !near(tone(at: cursor + s.seconds / 2 - 0.005), s.toneHz) { middlesOk = false }
    if i > 0 {
      // Where the previous tone gives way to this one, in 2 ms steps around the join.
      let previous = pauseSpecs[i - 1].toneHz
      var found: Double?
      var t = cursor - 0.15
      while t < cursor + 0.15 {
        if !near(tone(at: t), previous) && near(tone(at: t + 0.012), s.toneHz) { found = t + 0.01; break }
        t += 0.002
      }
      joinErrors.append(found.map { abs($0 - cursor) } ?? 1)
    }
    cursor += s.seconds
  }
  check(middlesOk, "pause/resume: every segment's middle has its own tone (sound in its own segment)")
  let worst = joinErrors.max() ?? 1
  check(worst < 0.045, String(format: "pause/resume: sound changes at every join within %.0f ms of the picture (limit 45 ms)", worst * 1000))

  // Bitrate at the recording settings, on camera-like moving detail.
  let noisy = [
    SegmentSpec(name: "noise1", seconds: 3, width: 1920, height: 1080, transform: rotate90, toneHz: 440, withAudio: true, noise: true),
    SegmentSpec(name: "noise2", seconds: 3, width: 1920, height: 1080, transform: rotate90Mirrored, toneHz: 550, withAudio: true, noise: true),
  ]
  var noisyUrls: [URL] = []
  for s in noisy { noisyUrls.append(try await makeSegment(s)) }
  // iOS keeps a one-segment take as .mp4 although the camera wrote QuickTime: such a file must read too.
  let misnamed = dir.appendingPathComponent("noise1-quicktime-named.mp4")
  try? FileManager.default.removeItem(at: misnamed)
  try FileManager.default.copyItem(at: noisyUrls[0], to: misnamed)
  let noisyOut = dir.appendingPathComponent("stitched-noise.mp4")
  try? FileManager.default.removeItem(at: noisyOut)
  let t0 = Date()
  try await VideoStitcher.stitch([misnamed, noisyUrls[1]], to: noisyOut)
  print(String(format: "detail segments stitched in %.2f s", Date().timeIntervalSince(t0)))
  let noisyAsset = AVURLAsset(url: noisyOut)
  let nv = try await noisyAsset.loadTracks(withMediaType: .video)
  let nrate = try await nv[0].load(.estimatedDataRate) / 1_000_000
  check(nrate > 1.8 && nrate < 3.2, String(format: "video bitrate %.2f Mbps on moving detail (target 2.5)", nrate))
  let bytes = (try FileManager.default.attributesOfItem(atPath: noisyOut.path)[.size] as? NSNumber)?.intValue ?? 0
  print(String(format: "6 s detail file: %.2f MB (30 s would be about %.1f MB)", Double(bytes) / 1_000_000, Double(bytes) * 5 / 1_000_000))
  let ndur = try await noisyAsset.load(.duration).seconds
  check(abs(ndur - 6) < 0.05, String(format: "QuickTime file named .mp4 reads; duration %.3f s", ndur))

  // Failure: a missing segment is an input error and leaves no file.
  let bad = dir.appendingPathComponent("bad.mp4")
  try? FileManager.default.removeItem(at: bad)
  do {
    try await VideoStitcher.stitch([urls[0], dir.appendingPathComponent("missing.mov")], to: bad)
    check(false, "missing segment rejected")
  } catch VideoStitcherError.input(let detail) {
    check(true, "missing segment rejected as an input error (\(detail))")
  }
  // Failure: a file that is not a video.
  let junk = dir.appendingPathComponent("junk.mov")
  try Data("not a video".utf8).write(to: junk)
  do {
    try await VideoStitcher.stitch([urls[0], junk], to: bad)
    check(false, "unreadable segment rejected")
  } catch VideoStitcherError.input(let detail) {
    check(true, "unreadable segment rejected as an input error (\(detail))")
  }

  // Failure mid-encode: the writer runs out of space part-way (as when iOS invalidates the encoder after
  // the app goes to the background). The stitch must end with an export error, not hang
  // (VideoStitcherModule.swift deletes the partial file on any error).
  // STITCH_FULL_DISK names a small mounted volume (run.sh makes one).
  if let full = ProcessInfo.processInfo.environment["STITCH_FULL_DISK"] {
    let target = URL(fileURLWithPath: full).appendingPathComponent("full.mp4")
    let settled = Atomic()
    DispatchQueue.global().asyncAfter(deadline: .now() + 30) {
      if !settled.isSet {
        print("FAIL a writer that fails mid-encode leaves the stitch hanging (no result after 30 s)")
        exit(1)
      }
    }
    do {
      try await VideoStitcher.stitch(noisyUrls + noisyUrls + noisyUrls, to: target)
      settled.set()
      check(false, "a full disk fails the stitch")
    } catch VideoStitcherError.export(let detail) {
      settled.set()
      check(true, "a writer failing mid-encode ends the stitch with an export error (\(detail))")
    }
  } else {
    print("skipped: full-disk check (STITCH_FULL_DISK not set)")
  }
} catch {
  print("ERROR", error)
  failures += 1
}
final class Atomic: @unchecked Sendable {
  private let lock = NSLock()
  private var value = false
  var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
  func set() { lock.lock(); value = true; lock.unlock() }
}

print(failures == 0 ? "ALL PASS" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
