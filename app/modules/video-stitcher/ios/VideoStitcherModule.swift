// Expo module for the video stitcher: one function, stitch(uris) -> URI of a new MP4 in the cache.
// The work is in VideoStitcher.swift; this maps its errors to the codes the app reads
// (ERR_STITCH_INPUT, ERR_STITCH_EXPORT) and deletes the output when it fails.
import ExpoModulesCore

public final class VideoStitcherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoStitcher")

    AsyncFunction("stitch") { (uris: [String]) async throws -> String in
      let inputs = try uris.map { uri -> URL in
        guard let url = URL(string: uri), url.isFileURL else {
          throw StitchInputException(uri)
        }
        return url
      }
      let output = try VideoStitcher.newOutputURL()
      do {
        try await VideoStitcher.stitch(inputs, to: output)
      } catch {
        try? FileManager.default.removeItem(at: output)
        switch error {
        case VideoStitcherError.input(let detail):
          throw StitchInputException(detail)
        case VideoStitcherError.export(let detail):
          throw StitchExportException(detail)
        default:
          throw StitchExportException(error.localizedDescription)
        }
      }
      return output.absoluteString
    }
  }
}

final class StitchInputException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "A segment cannot be read: \(param)"
  }
}

final class StitchExportException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "The segments could not be joined: \(param)"
  }
}
