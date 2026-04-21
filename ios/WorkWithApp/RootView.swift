import SwiftUI
import AVFoundation

struct RootView: View {
  private let bundledWebApp = BundledWebApp.locate()

  var body: some View {
    ZStack {
      Color.black
        .ignoresSafeArea()

      if let bundledWebApp {
        WorkWithWebView(
          entryURL: bundledWebApp.entryURL,
          readAccessURL: bundledWebApp.readAccessURL
        )
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
