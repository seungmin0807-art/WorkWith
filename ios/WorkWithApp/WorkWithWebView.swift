import SwiftUI
import UIKit
import WebKit

struct WorkWithWebView: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.defaultWebpagePreferences.preferredContentMode = .mobile

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.bounces = false
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.allowsLinkPreview = false

    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }

    let request = URLRequest(
      url: url,
      cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
      timeoutInterval: 60
    )
    webView.load(request)
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    guard webView.url != url else { return }
    let request = URLRequest(
      url: url,
      cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
      timeoutInterval: 60
    )
    webView.load(request)
  }

  final class Coordinator: NSObject, WKNavigationDelegate {
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
      if host == "127.0.0.1" || host == "localhost" || requestURL.scheme == "about" {
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
  }
}
