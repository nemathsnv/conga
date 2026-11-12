// Reads an MP4 recorded on Android: tracks (codec, duration, bitrate, frame rate, size, rotation, audio
// rate and channels), gaps between audio buffers (continuity across joins), per-second audio peaks,
// and optional frames saved as PNGs beside the file. macOS AVFoundation only; no ffmpeg needed.
//   swiftc -O scripts/android-device/probe.swift -o <work>/probe && <work>/probe clip.mp4 [seconds ...]
import AVFoundation
import AppKit

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let asset = AVURLAsset(url: url)
let done = DispatchSemaphore(value: 0)
Task {
  let duration = try await asset.load(.duration)
  let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) ?? 0
  print("duration", String(format: "%.3f", duration.seconds), "bytes", size)
  for track in try await asset.load(.tracks) {
    let range = try await track.load(.timeRange)
    let rate = try await track.load(.estimatedDataRate)
    let fps = try await track.load(.nominalFrameRate)
    let natural = try await track.load(.naturalSize)
    let transform = try await track.load(.preferredTransform)
    for fd in try await track.load(.formatDescriptions) {
      let st = CMFormatDescriptionGetMediaSubType(fd)
      let codec = String(bytes: [UInt8(st >> 24 & 255), UInt8(st >> 16 & 255), UInt8(st >> 8 & 255), UInt8(st & 255)], encoding: .ascii) ?? "?"
      var extra = ""
      if track.mediaType == .audio, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd)?.pointee {
        extra = "rate \(asbd.mSampleRate) ch \(asbd.mChannelsPerFrame)"
      }
      print(track.mediaType.rawValue, codec, "start", String(format: "%.3f", range.start.seconds), "dur", String(format: "%.3f", range.duration.seconds),
            "kbps", Int(rate / 1000), "fps", fps, "size", natural, "rot", atan2(transform.b, transform.a) * 180 / .pi, extra)
    }
    if track.mediaType == .audio {
      let reader = try AVAssetReader(asset: asset)
      let out = AVAssetReaderTrackOutput(track: track, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16,
                                                                       AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false])
      reader.add(out)
      reader.startReading()
      var last: Double? = nil, maxGap = 0.0, buffers = 0
      var peaks: [Int: Int16] = [:]
      while let sb = out.copyNextSampleBuffer() {
        let pts = CMSampleBufferGetPresentationTimeStamp(sb).seconds
        let d = CMSampleBufferGetDuration(sb).seconds
        if let l = last { maxGap = max(maxGap, pts - l) }
        last = pts + (d.isFinite ? d : 0)
        if let bb = CMSampleBufferGetDataBuffer(sb) {
          var len = 0
          var ptr: UnsafeMutablePointer<CChar>? = nil
          CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr)
          if let p = ptr {
            p.withMemoryRebound(to: Int16.self, capacity: len / 2) { s in
              for i in 0..<(len / 2) {
                let v = Int16(min(abs(Int32(s[i])), 32767))
                if v > (peaks[Int(pts)] ?? 0) { peaks[Int(pts)] = v }
              }
            }
          }
        }
        buffers += 1
      }
      print("audio buffers", buffers, "end", String(format: "%.3f", last ?? 0), "max gap", String(format: "%.4f", maxGap),
            "peaks/s", peaks.sorted { $0.key < $1.key }.map { "\($0.key):\($0.value)" }.joined(separator: " "))
    }
  }
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = .zero
  for a in args.dropFirst(2) {
    if let (img, _) = try? await gen.image(at: CMTime(seconds: Double(a)!, preferredTimescale: 600)) {
      let out = url.deletingPathExtension().path + "-t\(a).png"
      try NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
      print("frame", a, out)
    }
  }
  done.signal()
}
done.wait()
