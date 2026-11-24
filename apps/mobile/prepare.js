// Push notifications only work once Firebase's config file is in the Android project (sha7n pattern).
const fs = require('fs'), path = require('path');
const hasAndroid = fs.existsSync(path.join(__dirname, 'android', 'app', 'google-services.json'));
console.log('push notifications — android:', hasAndroid ? 'on' : 'off');
