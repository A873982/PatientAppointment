INSERT INTO users (username, password_hash, access)
VALUES
  ('Admin', 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', 1),
  ('Demo', 'c75f28325cfa028ea13872f977a29e0e87c99a4f390fe260f24d7e1f05fb8d75', 2)
ON CONFLICT (username) DO NOTHING;

INSERT INTO doctors (id, name, specialty, image, availability, room_no, address)
VALUES
  ('dr_smith', 'Dr. Sarah Smith', 'Cardiologist', 'https://picsum.photos/id/64/200/200', 'Mon-Fri', 'Room 101', '123 Medical Plaza, Health City'),
  ('dr_patel', 'Dr. Raj Patel', 'Dermatologist', 'https://picsum.photos/id/91/200/200', 'Tue-Sat', 'Room 205', '123 Medical Plaza, Health City'),
  ('dr_chen', 'Dr. Emily Chen', 'Pediatrician', 'https://picsum.photos/id/338/200/200', 'Mon-Thu', 'Room 304', '123 Medical Plaza, Health City')
ON CONFLICT (id) DO NOTHING;
