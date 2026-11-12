Pod::Spec.new do |s|
  s.name           = 'VideoStitcher'
  s.version        = '0.1.0'
  s.summary        = 'Joins the segments of one take into one H.264/AAC MP4 (Conga, B-1).'
  s.description    = 'Expo local module: AVMutableComposition + AVAssetReader/AVAssetWriter.'
  s.author         = 'Conga'
  s.homepage       = 'https://conga.churntech.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreVideo'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
