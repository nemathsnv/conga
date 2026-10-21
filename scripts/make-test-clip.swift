// Writes the provider tests' disposable clip: 6.0 seconds, 720x1280 portrait, 30 fps, H.264 in MP4,
// no audio, no person or place in it (a slow colour sweep with a moving bar). AVFoundation only, so no
// dependency. Prints the duration it reads back and the SHA-256 of the file.
//
//   swift scripts/make-test-clip.swift <output.mp4>
import AVFoundation
import CoreVideo
import CryptoKit
import Foundation

let args = CommandLine.arguments
guard args.count == 2 else { FileHandle.standardError.write("usage: make-test-clip.swift <output.mp4>\n".data(using: .utf8)!); exit(2) }
let out = URL(fileURLWithPath: args[1])
if FileManager.default.fileExists(atPath: out.path) { FileHandle.standardError.write("refusing: \(out.path) exists\n".data(using: .utf8)!); exit(2) }

let width = 720, height = 1280, fps: Int32 = 30, seconds = 6
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_500_000],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
guard writer.startWriting() else { fatalError("startWriting: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let frames = Int(fps) * seconds
for i in 0..<frames {
  while !input.isReadyForMoreMediaData { usleep(1000) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  guard let buffer = pb else { fatalError("no pixel buffer") }
  CVPixelBufferLockBaseAddress(buffer, [])
  let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
  let row = CVPixelBufferGetBytesPerRow(buffer)
  let t = Double(i) / Double(frames)
  let barY = Int(t * Double(height - 80))
  for y in 0..<height {
    let onBar = y >= barY && y < barY + 80
    for x in 0..<width {
      let p = base + y * row + x * 4
      if onBar { p[0] = 255; p[1] = 255; p[2] = 255 } else {
        p[0] = UInt8(80 + 120 * t)                       // blue
        p[1] = UInt8(40 + 150 * Double(x) / Double(width)) // green
        p[2] = UInt8(200 - 140 * t)                      // red
      }
      p[3] = 255
    }
  }
  CVPixelBufferUnlockBaseAddress(buffer, [])
  adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { fatalError("writer: \(String(describing: writer.error))") }

let asset = AVURLAsset(url: out)
let duration = CMTimeGetSeconds(asset.duration)
let data = try Data(contentsOf: out)
let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
print("wrote \(out.lastPathComponent): \(String(format: "%.3f", duration)) s, \(width)x\(height), \(fps) fps, \(data.count) bytes, sha256 \(hash)")
