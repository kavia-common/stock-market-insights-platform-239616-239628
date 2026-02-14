import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Stock Check header", () => {
  render(<App />);

  // Use an exact match to avoid ambiguity with other "Stock Check" occurrences
  // (e.g., footer text, model version strings, etc.).
  const title = screen.getByText(/^Stock Check$/i);
  expect(title).toBeInTheDocument();
});
