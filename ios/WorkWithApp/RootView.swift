import SwiftUI
import AVFoundation

struct RootView: View {
  private let bundledWebApp = BundledWebApp.locate()
  private let appBackground = Color(red: 244 / 255, green: 247 / 255, blue: 251 / 255)

  var body: some View {
    ZStack {
      appBackground
        .ignoresSafeArea()

      if let bundledWebApp {
        WorkWithWebView(
          entryURL: bundledWebApp.entryURL,
          readAccessURL: bundledWebApp.readAccessURL
        )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .ignoresSafeArea()
      } else {
        VStack(spacing: 16) {
          Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(.yellow)

          Text("번들된 WorkWith 웹앱을 찾지 못했습니다.")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(.white.opacity(0.88))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(appBackground.ignoresSafeArea())
    .task {
      CameraPermissionPrimer.requestIfNeeded()
    }
  }
}

private enum CameraPermissionPrimer {
  static func requestIfNeeded() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined else {
      return
    }

    AVCaptureDevice.requestAccess(for: .video) { _ in }
  }
}
