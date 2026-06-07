/**
 * @file WorkoutSuggestions.jsx
 * @description Shows vague, goal-based workout hints while an instructor
 * builds or customises a plan for a client.
 */

import { getWorkoutSuggestions, getClientGoal, normalizeClientGoal } from "../utils/workoutSuggestions";
import "./WorkoutSuggestions.css";

const WorkoutSuggestions = ({ client, className = "" }) => {
  const goal = getClientGoal(client);
  const suggestions = getWorkoutSuggestions(goal);
  const normalizedGoal = normalizeClientGoal(goal);

  return (
    <aside
      className={`workout-suggestions ${className}`.trim()}
      aria-label="Workout suggestions based on client goal"
    >
      <h4 className="workout-suggestions__title">
        Workout suggestions
        {normalizedGoal ? (
          <>
            {" "}for <span className="workout-suggestions__goal">{normalizedGoal}</span>
          </>
        ) : goal ? (
          <>
            {" "}for <span className="workout-suggestions__goal">{goal}</span>
          </>
        ) : null}
      </h4>
      <ul className="workout-suggestions__list">
        {suggestions.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="workout-suggestions__hint">
        General guidance only — adjust exercises and volume to suit your client.
      </p>
    </aside>
  );
};

export default WorkoutSuggestions;
