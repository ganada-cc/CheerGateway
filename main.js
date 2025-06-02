require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

// 1. JWT 인증 미들웨어
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: '토큰 없음' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰' });
    req.user = user; // { user_id, ... }
    next();
  });
}

// 2. Proxy 설정 (각 마이크로서비스 경로)
const observeDiaryProxy = createProxyMiddleware({
  target: 'http://observe-diary.default.svc.cluster.local',
  changeOrigin: true,
  pathRewrite: { '^/observediary': '/calendar' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

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
  pathRewrite: { '^/user': '' },
});

app.get('/', (req, res) => {
  res.redirect('/user');
});

// 3. 라우팅 등록
app.use('/', userProxy); // 루트 접속 → User 서비스의 로그인 페이지
app.use('/observediary', authenticateToken, observeDiaryProxy);
app.use('/community', authenticateToken, communityProxy);
app.use('/minddiary', authenticateToken, mindDiaryProxy);

// 4. 서버 시작
app.listen(PORT, () => {
  console.log(`✅ cheer-gateway is running on port ${PORT}`);
});
