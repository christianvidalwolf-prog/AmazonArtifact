const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve dashboard_final.html from either current or parent directory
app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'dashboard_final.html'),
    path.join(__dirname, '..', 'dashboard_final.html')
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  res.status(404).send('<h1>Dashboard not found</h1><p>Please run the build script first: <code>npm run build</code></p>');
});

app.listen(PORT, () => {
  console.log(`CRAZE Dashboard running at http://localhost:${PORT}`);
});
