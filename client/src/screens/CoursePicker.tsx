import { useCallback, useEffect, useState } from 'react';
import type { Course } from '@audioworld/shared';
import { getCourses } from '../api';

interface CoursePickerProps {
  onPick: (course: Course) => void;
}

export function CoursePicker({ onPick }: CoursePickerProps) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setCourses(await getCourses());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="screen screen--picker">
      <div className="brand">
        <h1>AudioWorld</h1>
        <p>Walk into a soundscape and hear where every source is.</p>
      </div>

      {failed && (
        <div className="notice notice--error">
          <p>Couldn’t load the walks — check your connection.</p>
          <button type="button" className="btn-test" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!courses && !failed && <div className="notice">Loading walks…</div>}
      {courses && courses.length === 0 && !failed && (
        <div className="notice">No walks published yet.</div>
      )}

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
