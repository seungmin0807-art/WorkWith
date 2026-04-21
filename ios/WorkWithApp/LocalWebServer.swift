import Foundation
import GCDWebServer

@MainActor
final class LocalWebServer: ObservableObject {
  @Published private(set) var launchURL: URL?
  @Published private(set) var errorMessage: String?

  private var webServer: GCDWebServer?

  func startIfNeeded() {
    guard launchURL == nil, webServer == nil else { return }
    errorMessage = nil

    guard let webAppDirectoryURL = Bundle.main.resourceURL?.appendingPathComponent("app", isDirectory: true) else {
      errorMessage = "앱 리소스 위치를 찾을 수 없습니다."
      return
    }

    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: webAppDirectoryURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
      errorMessage = "번들된 웹앱 파일을 찾지 못했습니다."
      return
    }

    let server = GCDWebServer()
    server.addGETHandler(
      forBasePath: "/",
      directoryPath: webAppDirectoryURL.path,
      indexFilename: "index.html",
      cacheAge: 0,
      allowRangeRequests: true
    )

    do {
      try server.start(options: [
        GCDWebServerOption_Port: 0,
        GCDWebServerOption_BindToLocalhost: true,
        GCDWebServerOption_AutomaticallySuspendInBackground: false,
      ])
      guard let serverURL = server.serverURL else {
        errorMessage = "로컬 서버 주소를 만들지 못했습니다."
        return
      }
      webServer = server
      launchURL = serverURL.appendingPathComponent("index.html")
    } catch {
      errorMessage = "로컬 서버 시작에 실패했습니다. \(error.localizedDescription)"
    }
  }

  func restart() {
    stop()
    startIfNeeded()
  }

  func stop() {
    webServer?.stop()
    webServer = nil
    launchURL = nil
  }
}
