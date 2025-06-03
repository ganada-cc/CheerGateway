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
  console.log('>>> [AUTH] 진입:', req.method, req.originalUrl);
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.split(' ')[1];
  const tokenFromCookie = req.cookies['x_auth'];
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    console.log('❌ [AUTH] 토큰 없음');
    return res.status(401).json({ message: '토큰 없음' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ [AUTH] 유효하지 않은 토큰:', err.message);
      return res.status(403).json({ message: '유효하지 않은 토큰' });
    }

    console.log('✅ [AUTH] 토큰 파싱 성공:', user);
    req.user = user;
    next();
  });
}

// 📌 /calendar → observe-diary 프록시
const observeDiaryProxy = createProxyMiddleware({
  target: 'http://observe-diary.default.svc.cluster.local',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    console.log('[PROXY] observe-diary 요청 전달:', req.originalUrl);
    if (req.user?.user_id) {
      proxyReq.setHeader('x-user-id', req.user.user_id);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('[PROXY RES] observe-diary 응답 도착:', proxyRes.statusCode);
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '프록시 요청 중 에러 발생' }));
    }
  }
});



// 기타 프록시 설정
const communityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true,
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

// 📌 라우팅
// ✅ 여기! 가장 위에 추가
app.use((req, res, next) => {
  console.log('🔥 gateway가 실제 받은 요청:', req.method, req.originalUrl);
  next();
});
app.use('/calendar', (req, res, next) => {
  console.log('[DEBUG] /calendar 요청 도착');
  next();
}, authenticateToken, observeDiaryProxy);
app.use('/community', authenticateToken, communityProxy);
app.use('/minddiary', authenticateToken, mindDiaryProxy);
app.use('/', userProxy);

// 📌 서버 실행
app.listen(PORT, () => {
  console.log(`✅ cheer-gateway is running on port ${PORT}`);
});
