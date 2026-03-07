const http = require('http');

const data = JSON.stringify({
  username: 'testuser_' + Date.now(),
  email: 'test' + Date.now() + '@example.com',
  password: 'password123',
  gender: 'male',
  birthDate: '1990-01-01'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  
  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log('响应内容:');
    try {
      const parsed = JSON.parse(responseBody);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(responseBody);
    }
  });
});

req.on('error', (error) => {
  console.error('请求失败:', error);
});

req.write(data);
req.end();
