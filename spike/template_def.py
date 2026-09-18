"""Template = data. Expression authored once per shot, so the model never
copies identity attributes from the reference face."""
SHOTS = [
  dict(file="assets/templates/gta-redcarpet/shot_1.png",
       expression="a confident closed-mouth smirk: lips together but clearly curled up at both corners, "
                  "cheeks slightly raised, eyes relaxed and looking straight at the camera, chin level"),
  dict(file="assets/templates/gta-redcarpet/shot_2.png",
       expression="a warm open smile showing the upper front teeth, mouth clearly open in a grin, "
                  "cheeks pushed up, eyes narrowed slightly by the smile, head tilted, looking at the camera"),
  dict(file="assets/templates/gta-redcarpet/shot_3.png",
       expression="a subtle amused closed-mouth smile, lips together with the corners drawn up and slightly "
                  "to one side in a smirk, calm direct gaze at the camera"),
]

def prompt(expression):
    return (
"You are performing a FACE REPLACEMENT edit. Two inputs:\n"
"IMAGE A (first) = the scene. IMAGE B (second) = the identity to insert.\n"
"\n"
"Replace the man's face, hair and neck in IMAGE A with the man from IMAGE B. The output MUST clearly be "
"the man from IMAGE B: his exact bone structure, his exact skin tone, his hair, his beard, his eye colour. "
"Do not blend the two men. Do not darken or lighten his skin to match IMAGE A.\n"
"\n"
f"Give him this facial expression: {expression}.\n"
"This expression is required - do not render him neutral, deadpan or serious.\n"
"\n"
"Keep from IMAGE A only: the clothing, the background, the head angle, the lighting direction, the framing.\n"
"Photorealistic, matching grain. No text."
)
