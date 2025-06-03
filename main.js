require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

// JWT 인증 미들웨어
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.split(' ')[1];
  const tokenFromCookie = req.cookies['x_auth'];
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    console.log('❌ 토큰 없음');
    return res.status(401).json({ message: '토큰 없음' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ 유효하지 않은 토큰:', err.message);
      return res.status(403).json({ message: '유효하지 않은 토큰' });
    }

    console.log('✅ 토큰 파싱 성공:', user);
    req.user = user;
    next();
  });
}

// 👇 /calendar → observe-diary 로 연결되도록 프록시 설정
const calendarProxy = createProxyMiddleware({
  target: 'http://observe-diary.default.svc.cluster.local',
  changeOrigin: true,
  pathRewrite: { '^/calendar': '/calendar' }, // 그대로 유지
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

// 기타 프록시
const communityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true,
  pathRewrite: { '^/community': '' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

const mindDiaryProxy = createProxyMiddleware({
  target: 'http://mind-diary.default.svc.cluster.local',
  changeOrigin: true,
  pathRewrite: { '^/minddiary': '' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

const userProxy = createProxyMiddleware({
  target: 'http://user.default.svc.cluster.local',
  changeOrigin: true,
});

app.use('/', userProxy); // 루트 및 로그인은 그대로 User 서비스에 위임
app.use('/calendar', authenticateToken, calendarProxy); // 👈 여기 추가
app.use('/community', authenticateToken, communityProxy);
app.use('/minddiary', authenticateToken, mindDiaryProxy);

// 서버 실행
app.listen(PORT, () => {
  console.log(`✅ cheer-gateway is running on port ${PORT}`);
});
