import SwiftUI

struct RootView: View {
  @StateObject private var localServer = LocalWebServer()

  var body: some View {
    ZStack {
      Color.black
        .ignoresSafeArea()

      if let launchURL = localServer.launchURL {
        WorkWithWebView(url: launchURL)
          .ignoresSafeArea()
      } else {
        VStack(spacing: 16) {
          ProgressView()
            .tint(.white)

          Text(localServer.errorMessage ?? "WorkWith를 준비 중입니다.")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(.white.opacity(0.88))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)

          if localServer.errorMessage != nil {
            Button("다시 시도") {
              localServer.restart()
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
          }
        }
      }
    }
    .task {
      localServer.startIfNeeded()
    }
  }
}
