'use strict';

const API_SERVICE = "http://localhost:3000/api"
const WIDTH = 800;
const HEIGHT = 500;


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

function drawMap(duration) {
  d3.json(API_SERVICE + `/packets?duration=${duration}`, d => {
      const locs = d.packets.list.map(ll => [[ll.longitude, ll.latitude]]);
      console.log(locs.join(',\t'));
      svg.selectAll("circle")
        .data(locs)
        .enter()
        .append("circle")
        .attr("cx", d => projection(d[0])[0])
        .attr("cy", d => projection(d[0])[1])
        .attr("r", "5")
        .style("fill", "rgb(217,91,67)")
        .style("opacity", 0.85);

      updateList(d.packets.list);
    }
  );
}

function updateList(data) {
  d3.select("#list_body")
    .selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.latitude}, ${d.longitude}</td><td>${d.sum}</td>`;
    });
}
