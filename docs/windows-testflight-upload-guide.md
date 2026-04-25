# Windows To TestFlight Guide

This guide documents the Windows-only path used for `WorkWith`, so another Codex session can repeat it for another app without needing a Mac.

Do not commit Apple signing files, private keys, passwords, `.p12`, `.mobileprovision`, or `.p8` files. Put them only in GitHub Actions secrets.

## Current WorkWith Values

For this repository:

```text
App name: WorkWith
Bundle ID: com.seungmin0807.workwith
Workflow: .github/workflows/build-ios-signed-testflight.yml
XcodeGen spec: ios/project.yml
Signed IPA artifact: WorkWith-signed-ipa
```

For another app, replace the app name, Bundle ID, scheme name, icon path, and source paths in the workflow and XcodeGen project file.

## Overview

The Windows machine creates Apple signing materials, stores them as GitHub Actions secrets, and lets GitHub's macOS runner build, sign, package, and optionally upload the IPA.

The flow is:

```text
Windows creates CSR and .p12
Apple Developer creates App ID and App Store Connect provisioning profile
App Store Connect creates .p8 API key
GitHub Secrets receive base64 versions of .p12, .mobileprovision, and .p8
GitHub Actions macOS runner builds and signs the app
GitHub Actions uploads to TestFlight when enabled
```

## Required Apple Assets

You need:

```text
Apple Distribution certificate exported as .p12
App Store Connect provisioning profile as .mobileprovision
App Store Connect Team API key as .p8
```

The `.p8` is only required for automatic TestFlight upload from GitHub Actions. If you only want a signed IPA artifact, skip the `.p8` and run the workflow with `upload_to_testflight` unchecked.

## Create CSR On Windows

Use a local folder:

```powershell
mkdir C:\WorkWithSigning
cd C:\WorkWithSigning
```

Create `apple-distribution.inf`. Replace the email address.

```powershell
@"
[Version]
Signature="`$Windows NT`$"

[NewRequest]
Subject = "CN=WorkWith Distribution, E=your@email.com"
KeySpec = 2
KeyLength = 2048
Exportable = TRUE
MachineKeySet = FALSE
SMIME = FALSE
PrivateKeyArchive = FALSE
UserProtected = FALSE
UseExistingKeySet = FALSE
ProviderName = "Microsoft Enhanced RSA and AES Cryptographic Provider"
ProviderType = 24
RequestType = PKCS10
KeyUsage = 0xa0
HashAlgorithm = SHA256
"@ | Set-Content -Encoding ascii .\apple-distribution.inf
```

Create the CSR:

```powershell
certreq -new .\apple-distribution.inf .\WorkWith.certSigningRequest
```

Upload `WorkWith.certSigningRequest` to Apple Developer:

```text
developer.apple.com/account
> Certificates, Identifiers & Profiles
> Certificates
> +
> Apple Distribution
> upload WorkWith.certSigningRequest
> Generate
> Download distribution.cer
```

Save the downloaded certificate as:

```text
C:\WorkWithSigning\distribution.cer
```

## Install Apple Certificate Chain On Windows

Download from Apple's certificate authority page:

```text
https://www.apple.com/certificateauthority/
```

Required files:

```text
AppleWWDRCAG3.cer
AppleIncRootCertificate.cer
```

Install them for the current Windows user:

```powershell
cd C:\WorkWithSigning
certutil -user -addstore CA .\AppleWWDRCAG3.cer
certutil -user -addstore Root .\AppleIncRootCertificate.cer
```

If `certreq -accept .\distribution.cer` fails with `CERT_E_CRITICAL`, do not keep fighting it. Windows often rejects Apple's critical extensions. Use the manual store and repair path below.

## Attach Apple Certificate To The Private Key

Add the Apple Distribution certificate to the current user's personal store:

```powershell
cd C:\WorkWithSigning
certutil -user -addstore My .\distribution.cer
```

Get its thumbprint:

```powershell
$thumb = (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("C:\WorkWithSigning\distribution.cer")).Thumbprint
$thumb
```

Repair the store so Windows links the certificate to the private key created by the CSR:

```powershell
certutil -user -repairstore My $thumb
```

Verify that the certificate has the private key:

```powershell
Get-ChildItem Cert:\CurrentUser\My\$thumb |
  Select-Object Subject, Thumbprint, HasPrivateKey, NotAfter
```

This must show:

```text
HasPrivateKey : True
```

If it does not, the Apple certificate was not created from the CSR on this Windows machine. Create a new Apple Distribution certificate using the current `WorkWith.certSigningRequest`.

## Export The .p12

Generate a strong random `.p12` password:

```powershell
$bytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$newP12Password = (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
$newP12Password | Set-Clipboard
```

Save the clipboard value in a password manager. This value is the GitHub secret:

```text
IOS_CERTIFICATE_PASSWORD
```

Export the `.p12` with that password:

```powershell
$securePassword = ConvertTo-SecureString $newP12Password -AsPlainText -Force

Export-PfxCertificate `
  -Cert "Cert:\CurrentUser\My\$thumb" `
  -FilePath "C:\WorkWithSigning\WorkWith_Apple_Distribution.p12" `
  -Password $securePassword `
  -CryptoAlgorithmOption TripleDES_SHA1 `
  -Force
```

If GitHub Actions later says:

```text
security: SecKeychainItemImport: The user name or passphrase you entered is not correct.
```

the `.p12` and `IOS_CERTIFICATE_PASSWORD` do not match. Re-export the `.p12`, then update both `IOS_CERTIFICATE_PASSWORD` and `IOS_CERTIFICATE_P12_BASE64`.

## Create The App ID And Provisioning Profile

In Apple Developer:

```text
Certificates, Identifiers & Profiles
> Identifiers
> +
> App IDs
> App
```

Set the Bundle ID exactly:

```text
com.seungmin0807.workwith
```

For another app, use that app's Bundle ID.

Then create the provisioning profile:

```text
Profiles
> +
> Distribution
> App Store Connect
> select the Bundle ID
> select the Apple Distribution certificate
> Generate
> Download
```

Save it as:

```text
C:\WorkWithSigning\WorkWith.mobileprovision
```

Do not use a Development or Ad Hoc profile for TestFlight upload.

## Create App Store Connect API Key

This is needed only when the workflow should upload to TestFlight.

In App Store Connect:

```text
Users and Access
> Integrations
> App Store Connect API
> Team Keys
> Generate API Key
```

Use a role that can upload builds, such as `Developer` or `App Manager`.

Record:

```text
Key ID
Issuer ID
AuthKey_XXXXXXXXXX.p8
```

Apple only lets you download the `.p8` once. Store it carefully.

## GitHub Actions Secrets

Open:

```text
GitHub repository
> Settings
> Secrets and variables
> Actions
> New repository secret
```

Required to build a signed IPA:

```text
IOS_CERTIFICATE_P12_BASE64
IOS_CERTIFICATE_PASSWORD
IOS_PROVISION_PROFILE_BASE64
KEYCHAIN_PASSWORD
```

Required only for automatic TestFlight upload:

```text
APP_STORE_CONNECT_API_KEY_ID
APP_STORE_CONNECT_API_ISSUER_ID
APP_STORE_CONNECT_API_KEY_P8_BASE64
```

Generate `KEYCHAIN_PASSWORD`:

```powershell
$bytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
(($bytes | ForEach-Object { $_.ToString("x2") }) -join "") | Set-Clipboard
```

Base64 encode the `.p12`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\WorkWithSigning\WorkWith_Apple_Distribution.p12")) | Set-Clipboard
```

Paste the clipboard value into:

```text
IOS_CERTIFICATE_P12_BASE64
```

Base64 encode the `.mobileprovision`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\WorkWithSigning\WorkWith.mobileprovision")) | Set-Clipboard
```

Paste the clipboard value into:

```text
IOS_PROVISION_PROFILE_BASE64
```

Base64 encode the `.p8`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\WorkWithSigning\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

Paste the clipboard value into:

```text
APP_STORE_CONNECT_API_KEY_P8_BASE64
```

Use the raw Key ID and Issuer ID for:

```text
APP_STORE_CONNECT_API_KEY_ID
APP_STORE_CONNECT_API_ISSUER_ID
```

## GitHub Workflow

The workflow used here is:

```text
.github/workflows/build-ios-signed-testflight.yml
```

It:

```text
checks out the repository
generates the Xcode project
builds the iOS app without signing
injects the provisioning profile
forces iPhone-only settings for this app
codesigns the app using the .p12 certificate
packages WorkWith-signed.ipa
uploads the artifact
optionally uploads the IPA to TestFlight
```

For WorkWith, the workflow forces iPhone-only output with:

```text
TARGETED_DEVICE_FAMILY=1
UIDeviceFamily = [1]
UIRequiresFullScreen = true
```

This avoids iPad-only validation errors when the app is intended for iPhone only.

## Running The Workflow

For the first verification run:

```text
Actions
> Build iOS Signed IPA
> Run workflow
> marketing_version: 1.0.0
> build_number: leave empty
> upload_to_testflight: unchecked
```

This should create a GitHub artifact named:

```text
WorkWith-signed-ipa
```

After the signed IPA build succeeds, run again with:

```text
upload_to_testflight: checked
```

This uploads the signed IPA to App Store Connect/TestFlight.

The workflow uses the GitHub run number as `CFBundleVersion` when `build_number` is empty, so repeated uploads do not reuse build number `1`.

## App Store Connect Setup

Before uploading, create the app record:

```text
App Store Connect
> Apps
> +
> New App
```

For WorkWith:

```text
Name: WorkWith
Platform: iOS
Bundle ID: com.seungmin0807.workwith
SKU: workwith-ios-001
```

For another app, use a unique SKU and its own Bundle ID.

If App Store Connect asks for encryption compliance and the app does not implement its own crypto, choose:

```text
None of the algorithms mentioned above
```

In Korean UI:

```text
위에 언급된 알고리즘에 모두 해당하지 않음
```

## TestFlight

After upload, wait until the build finishes processing:

```text
App Store Connect
> App
> TestFlight
```

Internal testing:

```text
Internal Testing
> create/select group
> Add Builds
> add tester Apple IDs
```

Internal testers do not need Beta App Review, but they must accept the invitation with the same Apple ID used in the App Store/TestFlight app.

External testing and public links:

```text
External Testing
> create/select group
> Add Builds
> complete test information
> Submit for Beta App Review
> after approval, create Public Link
```

Public TestFlight links are external testing links, so Apple Beta App Review approval is required.

## Common Errors

### Missing P12 Secret

```text
Missing secret IOS_CERTIFICATE_P12_BASE64
```

Add or rename the GitHub secret.

### Wrong P12 Password

```text
security: SecKeychainItemImport: The user name or passphrase you entered is not correct.
```

Re-export the `.p12` with a known ASCII password. Update both:

```text
IOS_CERTIFICATE_PASSWORD
IOS_CERTIFICATE_P12_BASE64
```

### Profile Bundle ID Mismatch

```text
Provisioning profile bundle id is X, expected Y
```

Create a new App Store Connect provisioning profile for the exact Bundle ID in the app.

### iPad Icon 152x152 Missing

```text
Missing required icon file. The bundle does not contain an app icon for iPad of exactly '152x152'
```

If the app should be iPhone-only, force:

```text
TARGETED_DEVICE_FAMILY=1
UIDeviceFamily = [1]
UIRequiresFullScreen = true
```

If the app should support iPad, add proper iPad app icon assets instead.

### iPad Multitasking Orientation Error

```text
you need to include all of the orientations to support iPad multitasking
```

If the app should be iPhone-only, use the same iPhone-only settings above. If the app supports iPad, add all required iPad orientations or configure full screen appropriately.

### TestFlight App Asks For A Code

Usually the invite is not attached to the Apple ID currently signed into the App Store/TestFlight app.

Check:

```text
the iPhone App Store Apple ID matches the invited Apple ID
the build is added to the Internal Testing group
the tester is added to that group
compliance questions are completed
the invitation email was opened on the iPhone
```

## Security Notes

Never commit:

```text
.p12
.mobileprovision
.p8
Apple ID password
app-specific password
GitHub personal access token
base64 versions of secrets
```

Only commit:

```text
workflow YAML
project configuration
documentation
source code
icons and normal app assets
```

