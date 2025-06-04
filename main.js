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
    req.url = '/';
    return userProxy(req, res);
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
  // pathRewrite: (path, req) => {
  //   const rewrittenPath = '/calendar' + path;  // 필요에 따라 조절
  //   console.log('[pathRewrite] 원본 path:', path, '→ 재작성된 path:', rewrittenPath);
  //   return rewrittenPath;
  // },
  onProxyReq: (proxyReq, req) => {
    // console.log('[PROXY] onProxyReq 호출됨');
    // console.log('[PROXY] 요청 URL:', req.originalUrl);
    // console.log('[PROXY] 실제 프록시 요청 경로:', proxyReq.path);
    // console.log('[PROXY] req.user:', req.user);
    if (req.user?.user_id) {
      proxyReq.setHeader('x-user-id', req.user.user_id);
    //  console.log(`[PROXY] 헤더에 x-user-id: ${req.user.user_id} 추가됨`);
    } else {
    //  console.log('[PROXY] req.user 또는 user_id 없음, 헤더 설정 안함');
    }
  }
});

const communityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('x-user-id', req.user.user_id);
  },
});

const cssCommunityProxy = createProxyMiddleware({
  target: 'http://community.default.svc.cluster.local',
  changeOrigin: true
});

const mindDiaryProxy = createProxyMiddleware({
  target: 'http://mind-diary.default.svc.cluster.local',
  changeOrigin: true,
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
app.use('/css/community', cssCommunityProxy); 
app.use('/community', authenticateToken, communityProxy);
app.use('/minddiary', authenticateToken, mindDiaryProxy);
app.use('/', userProxy);

// 📌 서버 실행
app.listen(PORT, () => {
  console.log(`✅ cheer-gateway is running on port ${PORT}`);
});
