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

  drawMap(1); // by default 1 hour
});

d3.json(API_SERVICE + "/devices", data => {
  const devices = [{id: 0, name: "ALL"}];
  devices.push(...data.devices);
  console.log("devices", devices);
  d3.select(".ui.dropdown > .menu")
    .selectAll("div")
    .data(devices, d => d.id)
    .enter()
    .append("div")
    .attr("class", "item")
    .attr("data-value", d => d.ip_addr)
    .text(d => d.ip_addr || d.name);
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
    drawMap(duration);
  });
}

function drawMap(duration) {
  d3.json(API_SERVICE + `/packets?duration=${duration}`, d => {
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
      console.log("get loc:", lat, lng);
      d3.json(API_SERVICE + `/loc?lat=${lat}&lng=${lng}&duration=${window.iot_state.duration}`, d => {

        console.log("packet at loc:", d);
        updateDetailList(d.loc_packets);
      });
    });

    updateSummaryList(d.packets.list, duration);
  });
}

function updateDetailList(data) {
  const coord = window.iot_state.coord;
  const selectedLoc = window.iot_state.locs.filter(d => d.latitude === coord.lat && d.longitude === coord.lng)[0];
  d3.select("#list-title").attr("colspan", "4").text(`Packets in last ${window.iot_state.duration} hour(s) for ${selectedLoc.city}, 
    ${selectedLoc.state_province}, ${selectedLoc.country_code}`);
  d3.select("#list-column").selectAll("th").remove();
  d3.select("#list-column").html("<th>Time</th><th>Source</th><th>Destination</th><th>Size</th>");
  const listBody = d3.select("#list-body");
  listBody.selectAll("tr").remove();
  listBody.selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.packet_time}</td><td>${d.src_ip}</td><td>${d.dst_ip}</td><td>${d.size}</td>`;
    });
}

function updateSummaryList(data, duration) {
  d3.select("#list-title").attr("colspan", "3").text(`Number of packets in the last ${duration} hour(s) for all devices by location`)
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