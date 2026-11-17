"""Probe GPU backends in a short-lived process; the server owns no GPU context."""
import argparse
import json
import platform
import sys


def select_device(requested="auto", torch_module=None):
    if requested not in ("auto", "cpu", "cuda", "mps"):
        raise ValueError("Unknown device")
    if requested == "cpu":
        return {"device": "cpu", "deviceName": "CPU"}
    if sys.platform == "darwin":
        if requested == "cuda":
            raise RuntimeError("macOS 不支持 CUDA；请使用 --device auto、mps 或 cpu。")
        if platform.machine() != "arm64":
            if requested == "mps":
                raise RuntimeError("MPS 加速仅为原生 Apple 芯片环境启用；Intel / Rosetta 请使用 --device cpu。")
            return {"device": "cpu", "deviceName": "CPU", "deviceNote": "Intel / Rosetta 环境使用 CPU。"}
        device = "mps"
    else:
        if requested == "mps":
            raise RuntimeError("MPS 需要 Apple 芯片 Mac；当前系统请使用 --device auto 或 cpu。")
        device = "cuda"
    try:
        if torch_module is None:
            import torch as torch_module
        if device == "mps":
            if not torch_module.backends.mps.is_available():
                raise RuntimeError("MPS 不可用；请检查 macOS、原生 arm64 Python 与 PyTorch 环境。")
            torch_module.ones(1, device="mps").add_(1)
            torch_module.mps.synchronize()
            return {"device": "mps", "deviceName": "Apple GPU（MPS）"}
        if not torch_module.cuda.is_available():
            raise RuntimeError("未检测到可用 CUDA；请检查 NVIDIA 驱动和 CUDA 版 PyTorch。")
        # Availability alone does not prove the installed wheel supports the GPU.
        torch_module.ones(1, device="cuda").add_(1)
        torch_module.cuda.synchronize()
        return {"device": "cuda", "deviceName": torch_module.cuda.get_device_name(0)}
    except (ImportError, OSError, RuntimeError) as error:
        if requested in ("cuda", "mps"):
            raise RuntimeError(f"无法启用 GPU：{error}") from error
        return {"device": "cpu", "deviceName": "CPU", "deviceNote": str(error)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), default="auto")
    try:
        print(json.dumps(select_device(parser.parse_args().device), ensure_ascii=False))
    except RuntimeError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
