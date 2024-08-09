import * as nodemailer from 'nodemailer';
export default class MailSender {
  constructor(
    private transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      auth: {
        user: process.env.GOOGLE_GMAIL_USER,
        pass: process.env.GOOGLE_APP_PASSWORD,
      },
    }),
  ) {}
  sendEmailVerifyOTP(receiver: string, otp: string, verifyLink: string) {
    try {
      this.transporter.sendMail({
        from: process.env.GOOGLE_GMAIL_USER,
        to: receiver,
        subject: 'No Reply',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      background-color: #f0f0f0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: auto;
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    h2 {
      color: #333;
      text-align: center;
    }
    .btn {
      display: flex;
      justify: center;
      width: fit-content;
      background-color: #007bff;
      color: #fff;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 5px;
      margin-top: 20px;
      margin-bttom: 20px;
    }
    .btn:hover {
      background-color: #0056b3;
    }
  </style>
</head>
<body>
  <div class="container">
    <p>Xin chào ${receiver}</p>
    <h2>Cảm ơn bạn đã đăng ký tài khoản tại ứng dụng của chúng tôi.</h2>
    <p>Vui lòng nhập vào liên kết bên dưới để kích hoạt tài khoản của bạn, mã kích hoạt có hiệu lực trong vòng 15 phút</p>
    <a href="${verifyLink}" class="btn">Kích hoạt tài khoản</a>
    <p>Nếu bạn không thực hiện yêu cầu , bạn có thể bỏ qua email này</p>
  </div>
</body>
</html>`,
      });
    } catch (error) {
      throw new Error(error.message ?? 'Không thể gửi mail xác thực');
    }
  }
}
