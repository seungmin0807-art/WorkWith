import SwiftUI

@main
struct WorkWithApp: App {
  @UIApplicationDelegateAdaptor(AppOrientationDelegate.self) private var orientationDelegate

  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }
}
