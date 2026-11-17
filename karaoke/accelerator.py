"""Probe CUDA in a short-lived process so the HTTP server owns no GPU context."""
import argparse
import json


def select_device(requested="auto", torch_module=None):
    if requested not in ("auto", "cpu", "cuda"):
        raise ValueError("Unknown device")
    if requested == "cpu":
        return {"device": "cpu", "deviceName": "CPU"}
    try:
        if torch_module is None:
            import torch as torch_module
        if not torch_module.cuda.is_available():
            raise RuntimeError("未检测到可用 CUDA；请检查 NVIDIA 驱动和 CUDA 版 PyTorch。")
        # Availability alone does not prove the installed wheel supports the GPU.
        torch_module.ones(1, device="cuda").add_(1)
        torch_module.cuda.synchronize()
        return {"device": "cuda", "deviceName": torch_module.cuda.get_device_name(0)}
    except (ImportError, OSError, RuntimeError) as error:
        if requested == "cuda":
            raise RuntimeError(f"无法启用 GPU：{error}") from error
        return {"device": "cpu", "deviceName": "CPU", "deviceNote": str(error)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    print(json.dumps(select_device(parser.parse_args().device), ensure_ascii=False))
