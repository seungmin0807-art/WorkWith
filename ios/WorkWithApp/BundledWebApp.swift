import Foundation

struct BundledWebApp {
  let entryURL: URL
  let readAccessURL: URL

  static func locate() -> BundledWebApp? {
    // XcodeGen folder references keep the folder name as-is inside the bundle.
    // We try "BundledApp" (CI build) first, then "app" (legacy / manual).
    let candidates = ["BundledApp", "app"]
    for name in candidates {
      guard let dir = Bundle.main.resourceURL?.appendingPathComponent(name, isDirectory: true) else { continue }
      let indexURL = dir.appendingPathComponent("index.html")
      if FileManager.default.fileExists(atPath: indexURL.path) {
        return BundledWebApp(entryURL: indexURL, readAccessURL: dir)
      }
    }
    return nil
  }
}
