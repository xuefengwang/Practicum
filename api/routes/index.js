const express = require('express');
const router = express.Router();
const async = require('async');
const net = require('net')

router.get('/packets', function (req, res, next) {
  const duration = getDuration(req.query.duration);
  let deviceIP = req.query.device_ip;
  let sqlParams = [duration, duration];
  let deviceSql = '';
  if (net.isIPv4(deviceIP)) {
    deviceSql = ' AND (p.src_ip = ? OR p.dst_ip = ?) ';
    sqlParams = [duration, deviceIP, deviceIP, duration, deviceIP, deviceIP];
  }
  console.log(`packets for last ${duration} hour, for device: ${deviceIP}`);
  
  let packets;
  async.series({
    queryDb: cb => {
      req.db.query(`
      SELECT u.latitude, u.longitude, u.city, u.country_code, u.state_province, u.zip, SUM(size) total_size FROM
        (SELECT SUM(size) size, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.src_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' ${deviceSql} GROUP BY ic.latitude, ic.longitude
          UNION
          SELECT SUM(size) size, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.dst_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' ${deviceSql} GROUP BY ic.latitude, ic.longitude
        ) u
      GROUP BY u.latitude, u.longitude ORDER BY total_size DESC`, sqlParams, (err, results) => {
        if (err) return cb(err);

        packets = results.filter(a => a.latitude !== '0.000000' || a.longitude !== '0.000000');
        console.log(`For ${duration} hours, found ${packets.length} locations`);
        cb();
      });
    }
  }, err => {
    if (err) return next(err);

    res.json({ packets: {total: packets.length, list: packets } });
  });

});

router.get('/loc', (req, res, next) => {
  console.log("loc", req.query);
  if (!req.query.lat || !req.query.lng) {
    return res.json({error: "invalid latitude or longitude"});
  }
  const duration = getDuration(req.query.duration);
  let deviceSql = '';
  let sqlParams = [req.query.lat, req.query.lng, duration, req.query.lat, req.query.lng, duration];
  const deviceIP = req.query.device_ip;
  if (net.isIPv4(deviceIP)) {
    deviceSql = ' AND (p.src_ip = ? OR p.dst_ip = ?) ';
    sqlParams = [req.query.lat, req.query.lng, duration, deviceIP, deviceIP,
      req.query.lat, req.query.lng, duration, deviceIP, deviceIP];
  }
  req.db.query(`
  SELECT p.id, p.packet_time, p.protocol, p.src_ip, p.src_mac, p.dst_ip, p.dst_mac, p.size 
    FROM packet p JOIN 
    ( SELECT id FROM ip_coordinate WHERE latitude = ? AND longitude = ?) ic ON p.dst_ip_coord_id = ic.id 
    WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND p.protocol != 'ARP' ${deviceSql}
  UNION 
  SELECT p.id, p.packet_time, p.protocol, p.src_ip, p.src_mac, p.dst_ip, p.dst_mac, p.size
    FROM packet p JOIN 
    ( SELECT id FROM ip_coordinate WHERE latitude = ? AND longitude = ?) ic ON p.src_ip_coord_id = ic.id 
    WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND p.protocol != 'ARP' ${deviceSql}
  ORDER BY id LIMIT 50;`, sqlParams, (err, results) => {
    if (err) return next(err);

    res.json({loc_packets: results});
  });
});

router.get("/devices", (req, res, next) => {
  req.db.query('SELECT id, name, ip_addr, mac_addr FROM device ORDER BY id', (err, rows) => {
    if (err) return next(err);
    console.log("devices", rows.length);

    return res.json({devices: rows});
  })
});

router.post("/devices", (req, res, next) => {
  const devices = req.body;
  console.log("update device names", devices);
  async.eachSeries(Object.keys(devices), (dev, cb) => {
    req.db.query('UPDATE device SET name = ? WHERE ip_addr = ?', [devices[dev], dev], (err, result) => {
      if (err) return cb(err);

      console.log('updated', dev, result.affectedRows);
      cb();
    });
  }, (err, results) => {
    if (err) return next(err);

    res.json({msg: "ok"});
  });
});

function getDuration(param) {
  let duration = param;
  if (!duration) {
    duration = 1;  // by default, return the last 1 hour
  } else {
    duration = parseInt(duration);
    if (isNaN(duration)) duration = 1;
  }
  return duration;
}

router.get("/dns", (req, res, next) => {
  console.log("load dns entries");
  req.db.query("SELECT ip, name FROM dns ORDER BY ip", (err, rows) => {
    if (err) return next(err);

    return res.json({dns: rows});
  });
});

module.exports = router;