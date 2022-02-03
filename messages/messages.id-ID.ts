const General = {
    Welcome: "Selamat datang di Bot SAP Support Metrasys. Berikut perintah yang dapat Anda jalankan:\r\n\r\n" +
        "/resetpass - Reset Password\r\n" +
        "/unlockuid - Unlock User ID",
    PleaseWait: "Mohon tunggu"
}

const ResetPassword = {
    Start: "Anda akan melakukan reset password User ID SAP",
    YourUserId: "Masukkan User ID Anda",
    YourEmail: "Masukkan alamat Email Anda",
    YourSAPServer: "Pilih SAP Server",
    YourVerificationCode: "Kode verifikasi telah dikirim ke email Anda. Silahkan masukkan kode tersebut.",
    UserNotFound: "User {0} tidak terdaftar di Sistem.",
    EmailNotFound: "Email {0} tidak sesuai dengan User {1}.",
    InvalidVerificationCode: "Kode verifikasi yang Anda masukkan salah. Mohon masukkan kode verifikasi yang dikirim ke Email.",
    InvalidVerificationCode2: "Anda masih punya kesempatan {0} kali lagi untuk input kode verifikasi.",
    MaximumVerificationCount: "Anda telah memasukkan kode yang salah melebihi batas maksimum. Mohon kembali ke proses {0}.",
    PleaseWait: "Mohon tunggu",
    ResetSuccessful: "Password berhasil di-reset. Initial Password telah dikirim ke Email Anda.",
    ResetFailed: "Sistem gagal me-reset password Anda.",
    UserInvalid: "User tidak valid atau <i>locked</i> by Administrator. Silahkan hubungi IT Support"
};

const UnlockUserID = {
    Start: "Anda akan melakukan <i>unlock</i> User ID SAP",
    YourUserId: "Masukkan User ID Anda",
    YourEmail: "Masukkan alamat Email Anda",
    YourSAPServer: "Pilih Server SAP",
    YourVerificationCode: "Kode verifikasi telah dikirim ke email Anda. Silahkan masukkan kode tersebut.",
    UserNotFound: "User {0} tidak terdaftar di Sistem.",
    EmailNotFound: "Email {0} tidak sesuai dengan User {1}.",
    InvalidVerificationCode: "Kode verifikasi yang Anda masukkan salah. Mohon masukkan kode verifikasi yang dikirim ke Email.",
    InvalidVerificationCode2: "Anda masih punya kesempatan {0} kali lagi untuk input kode verifikasi.",
    MaximumVerificationCount: "Anda telah memasukkan kode yang salah melebihi batas maksimum. Mohon kembali ke proses {0}.",
    PleaseWait: "Mohon tunggu",
    UnlockSuccessful: "User {0} telah berhasil di-<i>unlock</i>.",
    UnlockFailed: "Sistem gagal melakukan <i>unlock</i>.",
    UserInvalid: "User tidak valid atau <i>locked</i> by Administrator. Silahkan hubungi IT Support",
    UserAlreadyUnlocked: "User {0} tidak ter-<i>locked</i>"
};

const Administration = {
    Welcome: "Berikut perintah administrator:\r\n\r\n" +
        "/syncsapuser - Synchronize User SAP\r\n" +
        "/restartbot - Restart Bot\r\n" +
        "/readlogs - Tampilkan Log Terakhir",
    YourSAPServer: "Pilih Server SAP",
    SyncComplete: "{0}/{1}",
    RestartConfirm: "Anda yakin melakukan restart Bot?",
    RestartCanceled: "Restart dibatalkan.",
    RestartSuccessful: "Bot telah berhasil di-restart.",
    RestartFailed: "Bot gagal di-restart",
    AnswerYes: 'YA',
    AnswerNo: 'TIDAK'
}

export default Object.assign({ General, ResetPassword, UnlockUserID, Administration });
