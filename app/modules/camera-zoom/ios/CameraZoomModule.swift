// Expo module: the largest zoom factor of the camera expo-camera records with, so the app can show
// and set a real "2×". expo-camera sets videoZoomFactor = max ^ zoom (CameraSessionManager.updateZoom)
// on the wide-angle camera of each side (DeviceDiscovery.defaultBackCamera / defaultFrontCamera),
// using that device's active format, which the session's 1080p preset chooses. Read it once the
// camera is ready.
import AVFoundation
import ExpoModulesCore

public final class CameraZoomModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CameraZoom")

    Function("maxZoomFactor") { (facing: String) -> Double? in
      let position: AVCaptureDevice.Position = facing == "back" ? .back : .front
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
        return nil
      }
      return Double(device.activeFormat.videoMaxZoomFactor)
    }
  }
}
