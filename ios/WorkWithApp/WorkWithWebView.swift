import SwiftUI
import UIKit
import WebKit

struct WorkWithWebView: UIViewRepresentable {
  let entryURL: URL
  let readAccessURL: URL

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.defaultWebpagePreferences.preferredContentMode = .mobile
    configuration.userContentController.add(context.coordinator, name: "workwithOrientation")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.bounces = false
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.allowsLinkPreview = false

    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }

    webView.loadFileURL(entryURL, allowingReadAccessTo: readAccessURL)
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    guard webView.url != entryURL else { return }
    webView.loadFileURL(entryURL, allowingReadAccessTo: readAccessURL)
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let requestURL = navigationAction.request.url else {
        decisionHandler(.cancel)
        return
      }

      let host = requestURL.host?.lowercased()
      if requestURL.isFileURL || host == "127.0.0.1" || host == "localhost" || requestURL.scheme == "about" {
        decisionHandler(.allow)
        return
      }

      if let scheme = requestURL.scheme?.lowercased(), scheme == "http" || scheme == "https" {
        UIApplication.shared.open(requestURL)
        decisionHandler(.cancel)
        return
      }

      decisionHandler(.allow)
    }

    func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      guard message.name == "workwithOrientation" else {
        return
      }

      switch message.body as? String {
      case "landscape":
        AppOrientationController.request(.landscape)
      case "portrait":
        AppOrientationController.request(.portrait)
      default:
        break
      }
    }

    @available(iOS 15.0, *)
    func webView(
      _ webView: WKWebView,
      requestMediaCapturePermissionFor origin: WKSecurityOrigin,
      initiatedByFrame frame: WKFrameInfo,
      type: WKMediaCaptureType,
      decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
      switch type {
      case .camera, .cameraAndMicrophone:
        decisionHandler(.grant)
      default:
        decisionHandler(.prompt)
      }
    }
  }
}
