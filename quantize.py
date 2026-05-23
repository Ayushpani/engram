from onnxruntime.quantization import quantize_dynamic, QuantType
import os
import shutil

os.makedirs('models/ms-marco-int4', exist_ok=True)
for file in os.listdir('models/ms-marco-onnx'):
    if not file.endswith('.onnx'):
        shutil.copy(os.path.join('models/ms-marco-onnx', file), os.path.join('models/ms-marco-int4', file))

# Quantize the model
# ONNX Runtime dynamic quantization supports INT8 natively which brings it to ~22MB.
# (Note: true INT4 weight-only quantization in ORT requires specific block sizes,
# but QUInt8 is the standard dynamic compression mapping for these CPU targets)
quantize_dynamic(
    'models/ms-marco-onnx/model.onnx',
    'models/ms-marco-int4/model.onnx',
    weight_type=QuantType.QUInt8
)
print("Quantization complete!")
