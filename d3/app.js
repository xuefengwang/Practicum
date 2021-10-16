const DATA = [
  { id: 1, name: "Lola", value: 60 },
  { id: 2, name: "Chiao", value: 65 },
  { id: 3, name: "Emily", value: 100 },
  { id: 4, name: "Mommy", value: 103 },
  { id: 5, name: "Daddy", value: 160 }
]

const xScale = d3.scaleBand().domain(DATA.map(d => d.name)).rangeRound([0, 400]).padding(0.2);
const yScale = d3.scaleLinear().domain([0, 200]).range([500, 0]);

const bars = d3.select("body")
  .select("svg")
  .classed("container", true)
  .selectAll("rect")
  .data(DATA)
  .enter().append("rect")
  .classed("bar", true)
  .attr("width", xScale.bandwidth())
  .attr("height", d => 500 - yScale(d.value))
  .attr("x", d => xScale(d.name))
  .attr("y", d => yScale(d.value));

// remove
// setTimeout(() => bars.data(DATA.slice(0, 2)).exit().remove(), 2000);

// update. just rebind data, then change attributes
setTimeout(() =>
  bars.data(DATA.map(d => {
    d.value = 40;
    return d;
  }))
    .attr("height", d => 500 - yScale(d.value))
    .attr("y", d => yScale(d.value)),
  2000);