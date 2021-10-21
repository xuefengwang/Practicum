const express = require('express');
const router = express.Router();
const async = require('async');

router.get('/packets', function (req, res, next) {
  let duration = req.query.duration;
  if (!duration) {
    duration = 1;  // by default, return the last 1 hour
  } else {
    duration = parseInt(duration);
    if (isNaN(duration)) duration = 1;
  }
  console.log(`packets for last ${duration} hour`);
  
  let packets;
  async.series({
    queryDb: cb => {
      req.db.query(`
      SELECT u.latitude, u.longitude, u.city, u.country_code, u.state_province, u.zip, sum(total) sum FROM
        (SELECT count(*) total, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.src_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE p.packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' GROUP BY ic.latitude, ic.longitude
          UNION
          SELECT count(*) total, ic.latitude, ic.longitude, iloc.city, iloc.state_province, iloc.country_code, iloc.zip FROM packet p 
          JOIN ip_coordinate ic ON p.dst_ip_coord_id = ic.id JOIN ip_location iloc ON ic.ip_location_id = iloc.id
          WHERE packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' GROUP BY ic.latitude, ic.longitude
        ) u
      GROUP BY u.latitude, u.longitude`, [duration, duration], (err, results) => {
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

function ip2int(ip) {
  return ip.split('.').reduce(function (ipInt, octet) { return (ipInt << 8) + parseInt(octet, 10) }, 0) >>> 0;
}

module.exports = router;
