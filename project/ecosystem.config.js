// Optional PM2 config. Hostinger's Node manager handles start/restart for you,
// but if you run the app over SSH with PM2:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "salty-pumpkin",
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
