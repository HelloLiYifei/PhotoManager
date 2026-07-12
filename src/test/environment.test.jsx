import { render, screen } from "@testing-library/react";

function TestEnvironmentSmoke() {
  return <p>PhotoManager test environment</p>;
}

describe("test environment", () => {
  it("renders React components in jsdom", () => {
    render(<TestEnvironmentSmoke />);

    expect(
      screen.getByText("PhotoManager test environment"),
    ).toBeInTheDocument();
  });
});
