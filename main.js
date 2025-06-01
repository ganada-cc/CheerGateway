require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const app = express();

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

// 인증 미들웨어
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: '토큰 없음' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰' });
    req.user = user; // { user_id: 'sso', ... }
    next();
  });
}

// 마이크로서비스 라우팅
const observeDiaryProxy = createProxyMiddleware({
  target: 'http://observe-diary.default.svc.cluster.local', // 쿠버네티스 내부 도메인
  changeOrigin: true,
  pathRewrite: { '^/observe-diary': '' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-Id', req.user.user_id); // 인증된 유저 ID 전달
  },
});

const communityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true,
  pathRewrite: { '^/community': '' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-Id', req.user.user_id);
  },
});

// 라우팅 등록
app.use('/observe-diary', authenticateToken, observeDiaryProxy);
app.use('/community', authenticateToken, communityProxy);


// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ API Gateway running on port ${PORT}`);
});
