require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'VlainaCapacitorStreamingHttp'
  spec.version = package['version']
  spec.summary = 'Native byte-streaming HTTP transport for Vlaina mobile.'
  spec.license = { type: 'AGPL-3.0-only' }
  spec.homepage = 'https://vlaina.com'
  spec.author = 'Vlaina'
  spec.source = { path: '.' }
  spec.source_files = 'ios/Sources/**/*.{swift,h,m}'
  spec.ios.deployment_target = '15.0'
  spec.dependency 'Capacitor'
  spec.swift_version = '5.9'
end
