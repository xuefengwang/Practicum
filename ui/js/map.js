'use strict';

const API_SERVICE = "http://localhost:3000/api"
const WIDTH = 800;
const HEIGHT = 500;
window.iot_state = {
  duration: 1
}

// D3 Projection
const projection = d3.geo.mercator()
  .scale(126)
  .translate([WIDTH / 2, HEIGHT / 2]);    // translate to center of screen

// Define path generator
const path = d3.geo.path()               // path generator that will convert GeoJSON to SVG paths
  .projection(projection);  // tell path generator to use albersUsa projection

const svg = d3.select("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

d3.json("world-110m.json", (err, topoJson) => {
  if (err) console.log(err);

  svg.selectAll("path")
    .data(topoJson.features)
    .enter()
    .append("path")
    .attr("d", path)
    .style("stroke", "#fff")
    .style("stroke-width", "1")
    .style("fill", "rgb(213, 222, 217)");

  drawMap(1, null); // by default 1 hour
});

d3.json(API_SERVICE + "/devices", data => {
  const devices = [{id: 0, name: "ALL"}];
  devices.push(...data.devices);
  console.log("devices", devices);
  window.iot_state.device_ip = null;
  window.iot_state.devices = devices;
  d3.select(".ui.dropdown > .menu")
    .selectAll("div")
    .data(devices, d => d.id)
    .enter()
    .append("div")
    .attr("class", "item")
    .attr("data-value", d => d.ip_addr)
    .text(d => d.name);

  // add event listener for dropdown
  $("#device_list > div.item").on("click", e => {
    const ip = e.currentTarget.getAttribute("data-value")
    console.log("selected device:", ip);
    window.iot_state.device_ip = ip;
    drawMap(window.iot_state.duration, ip);
  });

  // populate device edit window
  d3.select("#device-input")
    .selectAll("tr")
    .data(devices.filter(d => !!d.ip_addr))
    .enter()
    .append("tr")
    .html(d => `<tr><td>${d.ip_addr}</td><td><div class="ui input fluid"><input type="text" value="${d.name || ''}"></div></td></tr>`);
});

d3.json(API_SERVICE + "/dns", data => {
  window.iot_state.dns = data.dns;
});

setup();

function setup() {
  $('.ui.dropdown').dropdown();
  $("#duration-list > .duration").on("click", e => {
    $('#duration-list > .duration.positive').removeClass('positive');
    e.currentTarget.classList.add('positive');
    const duration = e.currentTarget.value;
    console.log("change duration:", duration);
    window.iot_state.duration = duration;
    drawMap(duration, window.iot_state.device_ip);
  });
  $("#manage-device").on("click", e => {
    $('.ui.modal').modal('show');
  });
  $("#edit-ok").on("click", e => {
    $("#device-input > tr").each((idx, element) => {
      let ip, name;
      $("td", element).each((i, td) => {
        if (i === 0) ip = $(td).text();
        if (i === 1) name = $("input", td).val();
      });
      const dev = window.iot_state.devices.filter(d => d.ip_addr === ip)[0];
      dev.name = name;
    });
    // update database
    const postData = {};
    window.iot_state.devices.forEach(d => {
      if (d.ip_addr) postData[d.ip_addr] = d.name;
    });
    $.post(API_SERVICE + '/devices', postData, data => {
      console.log(data);
    });
  });
}

function drawMap(duration, device_ip) {
  d3.json(API_SERVICE + `/packets?duration=${duration}&device_ip=${device_ip || ''}`, d => {
    const locs = d.packets.list.map(ll => [[ll.longitude, ll.latitude, ll.city, ll.state_province, ll.country_code, ll.zip]]);
    console.log(locs.join(',\t'));
    window.iot_state.locs = d.packets.list;
    svg.selectAll("circle").remove();
    svg.selectAll("circle")
      .data(locs)
      .enter()
      .append("circle")
      .attr("cx", d => projection(d[0])[0])
      .attr("cy", d => projection(d[0])[1])
      .attr("r", "5")
      .attr("lat", d => d[0][1])
      .attr("lng", d => d[0][0])
      .attr("data-content", d => `${d[0][2]}, ${d[0][3]}, ${d[0][4]} ${d[0][5]}`)
      .style("fill", "rgb(217,91,67)")
      .style("opacity", 0.85);

    $("circle").popup();

    $("circle").on("click", e => {
      let lat = e.currentTarget.getAttribute("lat");
      let lng = e.currentTarget.getAttribute("lng");
      window.iot_state.coord = {lat: lat, lng: lng};
      const dur = window.iot_state.duration || '';
      const ip = window.iot_state.device_ip || '';
      console.log("get loc:", lat, lng);
      d3.json(API_SERVICE + `/loc?lat=${lat}&lng=${lng}&duration=${dur}&device_ip=${ip}`, d => {
        console.log("packet at loc:", d);
        updateDetailList(d.loc_packets);
      });
    });

    updateSummaryList(d.packets.list, duration);
  });
}

const IoTIPRegex = new RegExp("^10\.20\.1\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$");

function updateDetailList(data) {
  const coord = window.iot_state.coord;
  const selectedLoc = window.iot_state.locs.filter(d => d.latitude === coord.lat && d.longitude === coord.lng)[0];
  d3.select("#list-title").attr("colspan", "5").text(`Packets in last ${window.iot_state.duration} hour(s) for ${selectedLoc.city}, 
    ${selectedLoc.state_province}, ${selectedLoc.country_code}`);
  d3.select("#list-column").selectAll("th").remove();
  d3.select("#list-column").html("<th>Time</th><th>Protocol</th><th>Source</th><th>Destination</th><th>Size</th>");

  // map iot device ip to name
  const devices = iot_state.devices;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < devices.length; j++) {
      if (IoTIPRegex.test(data[i].src_ip) && data[i].src_ip === devices[j].ip_addr) {
        data[i].src_ip = devices[j].name;
        data[i].dst_ip = dnsMap(data[i].dst_ip);
        break;
      } else if (IoTIPRegex.test(data[i].dst_ip) && data[i].dst_ip === devices[j].ip_addr) {
        data[i].dst_ip = devices[j].name;
        data[i].src_ip = dnsMap(data[i].src_ip);
        break;
      }
    }
  }

  const listBody = d3.select("#list-body");
  listBody.selectAll("tr").remove();
  listBody.selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.packet_time}</td><td>${d.protocol}</td><td>${d.src_ip}</td><td>${d.dst_ip}</td><td>${d.size}</td>`;
    });
}

function dnsMap(ip) {
  for (let i = 0; i < iot_state.dns.length; i++) {
    if (iot_state.dns[i].ip === ip) {
      return iot_state.dns[i].name;
    }
  }
  return ip;
}

function updateSummaryList(data, duration) {
  let devices = "all devices";
  if (window.iot_state.device_ip) {
    for (let i = 0; i < iot_state.devices.length; i++) {
      if (iot_state.devices[i].ip_addr === iot_state.device_ip) {
        devices = iot_state.devices[i].name;
      }
    }
  }
  d3.select("#list-title").attr("colspan", "3").html(
    `<span>Number of packets in the last <span class="duration">${duration} hours</span> for <span class="device">${devices}</span> by location</span>`)
  d3.select("#list-column").selectAll("th").remove();
  d3.select("#list-column").html("<th>Location</th><th>Coordinate</th><th>Size</th>");
  const listBody = d3.select("#list-body");
  listBody.selectAll("tr").remove();
  listBody.selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.city}, ${d.state_province}, ${d.country_code} ${d.zip}</td>
            <td>(${d.latitude}, ${d.longitude})</td><td>${humanFileSize(d.total_size)}</td>`;
    });
}

/**
 * https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/10420404
 * Format bytes as human-readable text.
 *
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 *
 * @return Formatted string.
 */
function humanFileSize(bytes, si=false, dp=1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10**dp;

  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

  return bytes.toFixed(dp) + ' ' + units[u];
}