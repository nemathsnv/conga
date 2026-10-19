Pod::Spec.new do |s|
  s.name           = 'CameraZoom'
  s.version        = '0.1.0'
  s.summary        = 'Reads the zoom range of the camera expo-camera records with (Conga).'
  s.description    = 'Expo local module: AVCaptureDevice videoMaxZoomFactor of the wide-angle camera.'
  s.author         = 'Conga'
  s.homepage       = 'https://conga.churntech.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
