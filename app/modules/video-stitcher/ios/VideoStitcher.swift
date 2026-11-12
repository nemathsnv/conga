// The AVFoundation core of the video stitcher (docs/BLOCKERS.md B-1, docs/release/CAMERA-FLIP.md).
// No Expo dependency, so the same file is exercised by a macOS harness on generated segments.
//
// AVMutableComposition puts the segments' video and audio end to end, in order. A video composition
// draws every segment upright into the first segment's frame with its own preferredTransform, so the
// first segment's orientation and size are kept and a front-camera segment stays mirrored exactly as
// it was recorded. AVAssetReader + AVAssetWriter re-encode it as H.264 at the recording bitrate
// (2.5 Mbps, RECORDING_SETTINGS) with AAC sound: AVAssetExportSession presets cannot set a bitrate and
// would multiply the upload several times over. The writer puts the moov atom first (fast start).
import AVFoundation
import CoreMedia
import CoreVideo

enum VideoStitcherError: Error {
  /// A segment is missing, unreadable or empty.
  case input(String)
  /// Composing, reading or writing failed.
  case export(String)
}

enum VideoStitcher {
  /// RECORDING_SETTINGS.videoBitrate in app/src/video/types.ts.
  static let videoBitrate = 2_500_000
  static let audioBitrate = 128_000

  static func newOutputURL() throws -> URL {
    let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let dir = caches.appendingPathComponent("VideoStitcher", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("\(UUID().uuidString).mp4")
  }

  static func stitch(_ inputs: [URL], to output: URL) async throws {
    guard !inputs.isEmpty else {
      throw VideoStitcherError.input("no segments")
    }
    let composition = AVMutableComposition()
    guard
      let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      throw VideoStitcherError.export("cannot create the composition tracks")
    }

    var cursor = CMTime.zero
    var renderSize = CGSize.zero
    var frameRate: Float = 30
    var audioFormat: (sampleRate: Double, channels: Int)?
    var instructions: [AVMutableVideoCompositionInstruction] = []

    for (index, url) in inputs.enumerated() {
      guard FileManager.default.fileExists(atPath: url.path) else {
        throw VideoStitcherError.input(url.lastPathComponent)
      }
      let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
      let sourceVideo: AVAssetTrack
      let transform: CGAffineTransform
      let naturalSize: CGSize
      let videoRange: CMTimeRange
      let nominalFrameRate: Float
      do {
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
          throw VideoStitcherError.input("\(url.lastPathComponent) has no video")
        }
        sourceVideo = track
        (transform, naturalSize, videoRange, nominalFrameRate) = try await track.load(.preferredTransform, .naturalSize, .timeRange, .nominalFrameRate)
      } catch let error as VideoStitcherError {
        throw error
      } catch {
        throw VideoStitcherError.input("\(url.lastPathComponent): \(error.localizedDescription)")
      }
      guard videoRange.duration > .zero, naturalSize.width > 0, naturalSize.height > 0 else {
        throw VideoStitcherError.input("\(url.lastPathComponent) is empty")
      }

      // The segment's span is its video track's; its sound is kept within it, at the same offset,
      // so picture and sound stay in sync across the joins.
      try videoTrack.insertTimeRange(videoRange, of: sourceVideo, at: cursor)
      if let sourceAudio = try? await asset.loadTracks(withMediaType: .audio).first,
         let audioRange = try? await sourceAudio.load(.timeRange) {
        let clipped = CMTimeRangeGetIntersection(audioRange, otherRange: videoRange)
        if clipped.duration > .zero {
          try audioTrack.insertTimeRange(clipped, of: sourceAudio, at: cursor + (clipped.start - videoRange.start))
          if audioFormat == nil, let format = try? await sourceAudio.load(.formatDescriptions).first,
             let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee {
            audioFormat = (asbd.mSampleRate, Int(asbd.mChannelsPerFrame))
          }
        }
      }

      let upright = uprightSize(naturalSize, transform)
      if index == 0 {
        renderSize = CGSize(width: even(upright.width), height: even(upright.height))
        if nominalFrameRate > 1 { frameRate = min(60, nominalFrameRate) }
      }

      let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      layer.setTransform(fit(transform, naturalSize: naturalSize, into: renderSize), at: cursor)
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: videoRange.duration)
      instruction.layerInstructions = [layer]
      instructions.append(instruction)

      cursor = cursor + videoRange.duration
    }

    if audioTrack.segments.isEmpty {
      composition.removeTrack(audioTrack)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(frameRate.rounded()))
    videoComposition.instructions = instructions

    try await encode(composition, videoComposition: videoComposition, duration: cursor, renderSize: renderSize,
                     frameRate: frameRate, audioFormat: audioTrack.segments.isEmpty ? nil : audioFormat ?? (44_100, 1), to: output)
  }

  /// The size a track is shown at once its transform is applied.
  static func uprightSize(_ natural: CGSize, _ transform: CGAffineTransform) -> CGSize {
    let rect = CGRect(origin: .zero, size: natural).applying(transform)
    return CGSize(width: abs(rect.width), height: abs(rect.height))
  }

  static func even(_ value: CGFloat) -> CGFloat {
    let rounded = Int(value.rounded())
    return CGFloat(max(2, rounded - rounded % 2))
  }

  /// The segment's own transform (rotation and any mirroring, as recorded), then scaled to fit and
  /// centred in the first segment's frame. Identical for segments shot the same way.
  static func fit(_ transform: CGAffineTransform, naturalSize: CGSize, into render: CGSize) -> CGAffineTransform {
    let rect = CGRect(origin: .zero, size: naturalSize).applying(transform)
    let toOrigin = transform.concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
    let scale = min(render.width / abs(rect.width), render.height / abs(rect.height))
    let scaled = toOrigin.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    let dx = (render.width - abs(rect.width) * scale) / 2
    let dy = (render.height - abs(rect.height) * scale) / 2
    return scaled.concatenating(CGAffineTransform(translationX: dx, y: dy))
  }

  static func encode(
    _ composition: AVComposition,
    videoComposition: AVVideoComposition,
    duration: CMTime,
    renderSize: CGSize,
    frameRate: Float,
    audioFormat: (sampleRate: Double, channels: Int)?,
    to output: URL
  ) async throws {
    let reader = try AVAssetReader(asset: composition)
    let compositionVideoTracks = try await composition.loadTracks(withMediaType: .video)
    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: compositionVideoTracks,
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    videoOutput.videoComposition = videoComposition
    videoOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(videoOutput) else {
      throw VideoStitcherError.export("cannot read the video")
    }
    reader.add(videoOutput)

    var audioOutput: AVAssetReaderAudioMixOutput?
    let channels = min(2, max(1, audioFormat?.channels ?? 1))
    let sampleRate = audioFormat?.sampleRate ?? 44_100
    if audioFormat != nil {
      let compositionAudioTracks = try await composition.loadTracks(withMediaType: .audio)
      let mix = AVAssetReaderAudioMixOutput(audioTracks: compositionAudioTracks, audioSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ])
      mix.alwaysCopiesSampleData = false
      guard reader.canAdd(mix) else {
        throw VideoStitcherError.export("cannot read the sound")
      }
      reader.add(mix)
      audioOutput = mix
    }

    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let keyFrameInterval = max(1, Int(frameRate.rounded()) * 2)
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(renderSize.width),
      AVVideoHeightKey: Int(renderSize.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: videoBitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: keyFrameInterval,
        AVVideoExpectedSourceFrameRateKey: Int(frameRate.rounded()),
      ],
    ])
    videoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput) else {
      throw VideoStitcherError.export("cannot write H.264 at \(Int(renderSize.width))x\(Int(renderSize.height))")
    }
    writer.add(videoInput)

    var audioInput: AVAssetWriterInput?
    if audioOutput != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVEncoderBitRateKey: audioBitrate,
      ])
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else {
        throw VideoStitcherError.export("cannot write AAC")
      }
      writer.add(input)
      audioInput = input
    }

    guard writer.startWriting() else {
      throw VideoStitcherError.export(writer.error?.localizedDescription ?? "the writer did not start")
    }
    guard reader.startReading() else {
      writer.cancelWriting()
      throw VideoStitcherError.export(reader.error?.localizedDescription ?? "the reader did not start")
    }
    writer.startSession(atSourceTime: .zero)

    var pairs: [(AVAssetReaderOutput, AVAssetWriterInput, String)] = [(videoOutput, videoInput, "video")]
    if let audioOutput, let audioInput {
      pairs.append((audioOutput, audioInput, "audio"))
    }
    await pumpAll(pairs, reader: reader, writer: writer)

    if reader.status == .failed || writer.status == .failed {
      let message = reader.error?.localizedDescription ?? writer.error?.localizedDescription ?? "reading or writing failed"
      if reader.status == .reading { reader.cancelReading() }
      writer.cancelWriting()
      throw VideoStitcherError.export(message)
    }
    writer.endSession(atSourceTime: duration)
    await writer.finishWriting()
    guard writer.status == .completed else {
      throw VideoStitcherError.export(writer.error?.localizedDescription ?? "the file was not finished")
    }
  }

  /// Copies each reader output into its writer input until every output is drained (or fails).
  /// The inputs are fed side by side: the writer interleaves them and stalls if one runs alone.
  /// When one copy fails (the writer failed, for example a hardware encoder invalidated after the
  /// app went to the background, or the reader failed), the others are ended too: a failed writer
  /// never asks the other input for more data, and without this the stitch would never settle.
  static func pumpAll(_ pairs: [(AVAssetReaderOutput, AVAssetWriterInput, String)], reader: AVAssetReader, writer: AVAssetWriter) async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      let group = DispatchGroup()
      let pumps = pairs.map { output, input, label in
        Pump(output: output, input: input, writer: writer, group: group, queue: DispatchQueue(label: "app.shortcut.videostitcher.\(label)"))
      }
      // Both copies can fail at the same moment (the writer failing fails both inputs), each on its
      // own queue. cancelReading must run once: two at once over-release inside AVFoundation and
      // crash the app (harness, 19 Oct: SIGTRAP in CFRelease under -[AVAssetReader cancelReading]).
      let aborted = Once()
      let abortAll = {
        guard aborted.first() else { return }
        reader.cancelReading()
        for pump in pumps { pump.queue.async { pump.finish() } }
      }
      for pump in pumps {
        group.enter()
        pump.onFailure = abortAll
        pump.input.requestMediaDataWhenReady(on: pump.queue) {
          pump.drain()
        }
      }
      group.notify(queue: .global()) {
        continuation.resume()
      }
    }
  }
}

/// True for the first caller only, from any thread.
private final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false

  func first() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if done { return false }
    done = true
    return true
  }
}

/// One output-to-input copy. Its queue is serial, so `finished` is only touched there.
private final class Pump: @unchecked Sendable {
  let output: AVAssetReaderOutput
  let input: AVAssetWriterInput
  let writer: AVAssetWriter
  let group: DispatchGroup
  let queue: DispatchQueue
  /// Ends every copy, this one included. Set before the first `drain`.
  var onFailure: (() -> Void)?
  private var finished = false

  init(output: AVAssetReaderOutput, input: AVAssetWriterInput, writer: AVAssetWriter, group: DispatchGroup, queue: DispatchQueue) {
    self.output = output
    self.input = input
    self.writer = writer
    self.group = group
    self.queue = queue
  }

  func drain() {
    guard !finished else { return }
    while input.isReadyForMoreMediaData {
      guard let buffer = output.copyNextSampleBuffer() else {
        // nil is the end of this track, or a reader that failed or was cancelled.
        finish()
        if writer.status != .writing { onFailure?() }
        return
      }
      guard input.append(buffer) else {
        finish()
        onFailure?()
        return
      }
    }
  }

  /// Leaves the group once. Marks the input finished only while the writer is still writing.
  func finish() {
    guard !finished else { return }
    finished = true
    if writer.status == .writing { input.markAsFinished() }
    group.leave()
  }
}
