import { useEffect, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { getCourses } from '../api';

interface CoursePickerProps {
  onPick: (course: Course) => void;
}

export function CoursePicker({ onPick }: CoursePickerProps) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCourses()
      .then((c) => alive && setCourses(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load courses'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="screen screen--picker">
      <div className="brand">
        <h1>AudioWorld</h1>
        <p>Walk into a soundscape and hear where every source is.</p>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {!courses && !error && <div className="notice">Loading courses…</div>}
      {courses && courses.length === 0 && <div className="notice">No courses yet.</div>}

      <ul className="course-list">
        {courses?.map((course) => (
          <li key={course.id}>
            <button className="course-card" onClick={() => onPick(course)}>
              <span className="course-card__name">{course.name}</span>
              {course.description && (
                <span className="course-card__desc">{course.description}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
