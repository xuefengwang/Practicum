const express = require('express');
const router = express.Router();
const async = require('async');

router.get('/packets', function (req, res, next) {

  let duration = req.params.duration;
  if (!duration) {
    duration = 1;  // by default, return the last 1 hour
  } else {
    duration = parseInt(duration);
    if (isNaN(duration)) duration = 1;
  }

  let packets;
  async.series({
    queryDb: cb => {
      req.db.query("SELECT src_ip, dst_ip, COUNT(*) total, SUM(size) bytes FROM packet " +
        "WHERE packet_time > NOW() - INTERVAL ? HOUR AND protocol != 'ARP' GROUP BY src_ip, dst_ip", [duration], (err, results) => {
        if (err) return cb(err);
        console.log(`For ${duration} hours, found ${results.length} packets`);
        packets = results;
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
