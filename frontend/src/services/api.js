export async function fetchChart(symbol) {
  const response = await fetch(
    `http://localhost:3000/chart/${symbol}`
  );

  return await response.json();
}