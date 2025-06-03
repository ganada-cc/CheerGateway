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
  console.log('>>> authenticateToken 미들웨어 진입:', req.path);
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
      console.log(err);
      console.log('❌ 유효하지 않은 토큰:', err.message);
      return res.status(403).json({ message: '유효하지 않은 토큰' });
    }

    console.log('✅ 토큰 파싱 성공:', user);
    req.user = user;
    next();
  });
}

// 👇 /calendar → observe-diary 로 연결되도록 프록시 설정
const observeDiaryProxy = createProxyMiddleware({
  target: 'http://observe-diary.default.svc.cluster.local',
  changeOrigin: true,
   followRedirects: false, 
 pathRewrite: { '^/calendar': '' },  // 🔥 필수
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

// 기타 프록시
const communityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true,
  // pathRewrite: { '^/community': '' },
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

app.use('/calendar', authenticateToken, observeDiaryProxy);
app.use('/community', authenticateToken, communityProxy);
app.use('/minddiary', authenticateToken, mindDiaryProxy);
app.use('/', userProxy);  

// 서버 실행
app.listen(PORT, () => {
  console.log(`✅ cheer-gateway is running on port ${PORT}`);
});
