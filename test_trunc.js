function truncateText(text, max, isDesc){
  if(!text||text.length<=max) return text;
  let t=text.substring(0,max);
  const lastSpace=t.lastIndexOf(" ");
  if(lastSpace>0) t=t.substring(0,lastSpace);
  t=t.replace(/[.,:;-]+$/,"");
  return isDesc ? t+"." : t;
}
console.log(truncateText("Modern isometric vector art depicting a commercial or residential building powered by solar panels. An upward trend chart symbolizes sustainable energy, cost savings, and sustainable business growth. Ideal for renewable energy marketing.", 200, true).length);
