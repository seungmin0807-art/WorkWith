import UIKit

final class AppOrientationDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    AppOrientationController.supportedOrientations
  }
}

enum AppOrientationController {
  enum Mode {
    case portrait
    case landscape
  }

  private(set) static var supportedOrientations: UIInterfaceOrientationMask = .portrait

  static func request(_ mode: Mode) {
    DispatchQueue.main.async {
      switch mode {
      case .portrait:
        apply(mask: .portrait, orientation: .portrait)
      case .landscape:
        apply(mask: .landscapeRight, orientation: .landscapeRight)
      }
    }
  }

  private static func apply(mask: UIInterfaceOrientationMask, orientation: UIInterfaceOrientation) {
    supportedOrientations = mask

    guard let windowScene = activeWindowScene() else {
      return
    }

    windowScene.activeWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
      #if DEBUG
      print("WorkWith orientation request failed: \(error.localizedDescription)")
      #endif
    }
    UIDevice.current.setValue(orientation.rawValue, forKey: "orientation")
    UIViewController.attemptRotationToDeviceOrientation()
  }

  private static func activeWindowScene() -> UIWindowScene? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
  }
}

private extension UIWindowScene {
  var activeWindow: UIWindow? {
    windows.first { $0.isKeyWindow } ?? windows.first
  }
}
