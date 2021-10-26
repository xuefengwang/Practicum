const express = require('express');
const router = express.Router();
const async = require('async');

router.get('/packets', function (req, res, next) {
  const duration = getDuration(req.query.duration);
  console.log(`packets for last ${duration} hour`);
  
  let packets;
  async.series({
    queryDb: cb => {
      req.db.query(`
      SELECT u.latitude, u.longitude, u.city, u.country_code, u.state_province, u.zip, SUM(size) total_size FROM
        (SELECT SUM(size) size, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.src_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' GROUP BY ic.latitude, ic.longitude
          UNION
          SELECT SUM(size) size, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.dst_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' GROUP BY ic.latitude, ic.longitude
        ) u
      GROUP BY u.latitude, u.longitude ORDER BY total_size DESC`, [duration, duration], (err, results) => {
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
  req.db.query(`
  SELECT p.id, p.packet_time, p.protocol, p.src_ip, p.src_mac, p.dst_ip, p.dst_mac, p.size 
    FROM packet p JOIN 
    ( SELECT id FROM ip_coordinate WHERE latitude = ? AND longitude = ?) ic ON p.dst_ip_coord_id = ic.id 
    WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND p.protocol != 'ARP' 
  UNION 
  SELECT p.id, p.packet_time, p.protocol, p.src_ip, p.src_mac, p.dst_ip, p.dst_mac, p.size
    FROM packet p JOIN 
    ( SELECT id FROM ip_coordinate WHERE latitude = ? AND longitude = ?) ic ON p.src_ip_coord_id = ic.id 
    WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND p.protocol != 'ARP' 
  ORDER BY id LIMIT 50;`, [req.query.lat, req.query.lng, duration, req.query.lat, req.query.lng, duration], (err, results) => {
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

module.exports = router;