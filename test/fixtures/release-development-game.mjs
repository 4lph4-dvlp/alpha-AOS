#!/usr/bin/env node
/**
 * CLI First-Person Game Fixture Oracle (VER-04, D-13, D-14)
 * Provides deterministic simulation and observable states for:
 * 1. Title/Start screen
 * 2. Movement inputs (forward, back, left, right)
 * 3. Fire inputs & projectile calculation
 * 4. Collision & hit rules
 * 5. Win / Loss terminal states
 */

export function createGame() {
  return {
    screen: "title",
    outcome: "in_progress",
    player: { x: 0, y: 0, heading: 0, health: 100 },
    targetsRemaining: 3,
    events: ["game_created"],
  };
}

export function stepGame(state, input) {
  const next = {
    screen: state.screen,
    outcome: state.outcome,
    player: { ...state.player },
    targetsRemaining: state.targetsRemaining,
    events: [...state.events],
  };

  switch (input) {
    case "start":
      next.screen = "first-person";
      next.events.push("screen_started_first_person");
      break;

    case "move:forward":
      if (next.screen === "first-person") {
        next.player.y += 1;
        next.events.push("player_moved_forward");
      }
      break;

    case "move:back":
      if (next.screen === "first-person") {
        next.player.y -= 1;
        next.events.push("player_moved_back");
      }
      break;

    case "turn:left":
      if (next.screen === "first-person") {
        next.player.heading = (next.player.heading - 90 + 360) % 360;
        next.events.push("player_turned_left");
      }
      break;

    case "turn:right":
      if (next.screen === "first-person") {
        next.player.heading = (next.player.heading + 90) % 360;
        next.events.push("player_turned_right");
      }
      break;

    case "fire":
      if (next.screen === "first-person") {
        next.events.push("weapon_fired");
        if (next.targetsRemaining > 0) {
          next.targetsRemaining -= 1;
          next.events.push("target_hit_and_destroyed");
          if (next.targetsRemaining === 0) {
            next.screen = "game_over";
            next.outcome = "win";
            next.events.push("terminal_state_win");
          }
        }
      }
      break;

    case "collide:hazard":
      if (next.screen === "first-person") {
        next.player.health = 0;
        next.events.push("collision_detected_hazard");
        next.screen = "game_over";
        next.outcome = "loss";
        next.events.push("terminal_state_loss");
      }
      break;

    default:
      next.events.push(`unknown_input_${input}`);
      break;
  }

  return next;
}

export function runSimulation(inputs) {
  let state = createGame();
  for (const input of inputs) {
    state = stepGame(state, input);
  }
  return state;
}

// CLI direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputsArg = process.argv[2] ?? "start,move:forward,fire,fire,fire";
  const inputs = inputsArg.split(",").map((s) => s.trim());
  const finalState = runSimulation(inputs);
  process.stdout.write(JSON.stringify(finalState, null, 2) + "\n");
}
