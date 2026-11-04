// 앱 자동 업데이트 (2026-11-04 사용자): GitHub Releases(package.json build.publish)에 새 버전이 올라오면 알아서 받아 두고
// 다음 종료 때 설치한다. 다 받으면 윈도우 알림 한 번 + 메뉴에 "업데이트하고 다시 시작". 설치본(app.isPackaged)에서만 돈다
// 릴리스에는 설치 파일과 같이 latest.yml(+ .blockmap)을 올려야 찾는다 (README "배포용 설치 파일")
// 시험: 설치본을 PET_UPDATE_URL=<latest.yml이 있는 주소>로 켜면 GitHub 대신 거기서 찾는다
const { app, Notification } = require('electron');

const CHECK_EVERY = 6 * 60 * 60 * 1000; // 켜 둔 채로 며칠 두는 앱이라 켤 때만이 아니라 6시간마다

function startUpdater({ onReady }) {
  if (!app.isPackaged) return null;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (process.env.PET_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.PET_UPDATE_URL });
  autoUpdater.on('error', (err) => console.error('업데이트 확인 실패:', err?.message ?? err));
  autoUpdater.on('update-available', (info) => console.log('새 버전 받는 중:', info.version));
  autoUpdater.on('update-downloaded', (info) => {
    console.log('새 버전 받아 둠:', info.version);
    onReady(info.version);
    // 윈도우 알림은 앱 ID가 있어야 뜬다 (설치 파일이 만든 바로가기와 같은 build.appId)
    app.setAppUserModelId('com.bluearchive.desktoppet');
    if (Notification.isSupported()) {
      new Notification({
        title: '샬레 당번 업데이트',
        body: `새 버전 ${info.version}을 받아 두었어요. 다음에 종료할 때 설치돼요. 메뉴의 "업데이트하고 다시 시작"으로 바로 설치할 수도 있어요.`,
      }).show();
    }
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {}); // 실패는 error 이벤트로 남김 (인터넷이 없을 때 등)
  check();
  setInterval(check, CHECK_EVERY);
  // 조용히 설치하고 다시 켠다
  return { install: () => autoUpdater.quitAndInstall(true, true) };
}

module.exports = { startUpdater };
