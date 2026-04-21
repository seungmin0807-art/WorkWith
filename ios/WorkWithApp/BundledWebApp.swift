import Foundation

struct BundledWebApp {
  let entryURL: URL
  let readAccessURL: URL

  static func locate() -> BundledWebApp? {
    guard let webAppDirectoryURL = Bundle.main.resourceURL?.appendingPathComponent("app", isDirectory: true) else {
      return nil
    }

    let indexURL = webAppDirectoryURL.appendingPathComponent("index.html")
    guard FileManager.default.fileExists(atPath: indexURL.path) else {
      return nil
    }

    return BundledWebApp(
      entryURL: indexURL,
      readAccessURL: webAppDirectoryURL
    )
  }
}
