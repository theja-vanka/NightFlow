cask "nightflow" do
  version "0.1.0"

  on_arm do
    url "https://github.com/theja-vanka/NightFlow/releases/download/v#{version}/NightFlow_#{version}_aarch64.dmg",
        verified: "github.com/theja-vanka/NightFlow/"
    sha256 :no_check
  end

  on_intel do
    url "https://github.com/theja-vanka/NightFlow/releases/download/v#{version}/NightFlow_#{version}_x64.dmg",
        verified: "github.com/theja-vanka/NightFlow/"
    sha256 :no_check
  end

  name "NightFlow"
  desc "Desktop app for managing and analyzing deep learning experiments"
  homepage "https://github.com/theja-vanka/NightFlow"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :high_sierra"

  app "NightFlow.app"

  zap trash: [
    "~/Library/Application Support/com.nightflow.desktop",
    "~/Library/Caches/com.nightflow.desktop",
    "~/Library/Preferences/com.nightflow.desktop.plist",
    "~/Library/Saved Application State/com.nightflow.desktop.savedState",
    "~/Library/WebKit/com.nightflow.desktop",
  ]
end
