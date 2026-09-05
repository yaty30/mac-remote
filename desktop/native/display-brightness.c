#include <AppKit/AppKit.h>
#include <CoreGraphics/CoreGraphics.h>
#include <IOKit/hidsystem/IOLLEvent.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <IOKit/hidsystem/ev_keymap.h>
#include <dlfcn.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*DisplayServicesSetBrightnessFn)(CGDirectDisplayID, float);

static kern_return_t post_hid_aux_key(int key, int event_type) {
  io_service_t service = IOServiceGetMatchingService(
    kIOMainPortDefault,
    IOServiceMatching(kIOHIDSystemClass)
  );

  if (!service) {
    return KERN_FAILURE;
  }

  io_connect_t connection = MACH_PORT_NULL;
  kern_return_t result = IOServiceOpen(
    service,
    mach_task_self(),
    kIOHIDParamConnectType,
    &connection
  );
  IOObjectRelease(service);

  if (result != KERN_SUCCESS) {
    return result;
  }

  NXEventData event;
  memset(&event, 0, sizeof(event));
  event.compound.subType = NX_SUBTYPE_AUX_CONTROL_BUTTONS;
  event.compound.misc.L[0] = (key << 16) | (event_type << 8);

  IOGPoint location = {0, 0};
  result = IOHIDPostEvent(
    connection,
    NX_SYSDEFINED,
    location,
    &event,
    kNXEventDataVersion,
    0,
    0
  );
  IOServiceClose(connection);

  return result;
}

static int post_hid_brightness_key(int key) {
  kern_return_t result = post_hid_aux_key(key, NX_KEYDOWN);

  if (result != KERN_SUCCESS) {
    return result;
  }

  return post_hid_aux_key(key, NX_KEYUP);
}

static int post_brightness_key(const char *direction) {
  int key = 0;

  if (strcmp(direction, "up") == 0) {
    key = NX_KEYTYPE_BRIGHTNESS_UP;
  } else if (strcmp(direction, "down") == 0) {
    key = NX_KEYTYPE_BRIGHTNESS_DOWN;
  } else {
    fprintf(stderr, "invalid brightness key direction: %s\n", direction);
    return 64;
  }

  const kern_return_t hid_result = post_hid_brightness_key(key);

  if (hid_result == KERN_SUCCESS) {
    return 0;
  }

  @autoreleasepool {
    for (int phase = 0; phase < 2; phase += 1) {
      const BOOL is_down = phase == 0;
      NSEvent *event = [NSEvent
        otherEventWithType:NSEventTypeSystemDefined
        location:NSZeroPoint
        modifierFlags:(is_down ? 0xA00 : 0xB00)
        timestamp:0
        windowNumber:0
        context:nil
        subtype:NX_SUBTYPE_AUX_CONTROL_BUTTONS
        data1:(key << 16) | ((is_down ? NX_KEYDOWN : NX_KEYUP) << 8)
        data2:-1
      ];

      if (!event.CGEvent) {
        fprintf(stderr, "failed to create brightness key event\n");
        return 70;
      }

      CGEventPost(kCGHIDEventTap, event.CGEvent);
    }
  }

  fprintf(stderr, "IOHIDPostEvent failed: %d\n", hid_result);
  return 0;
}

static int parse_brightness(const char *raw, float *value) {
  char *end = NULL;
  errno = 0;
  const float parsed = strtof(raw, &end);

  if (errno != 0 || end == raw || *end != '\0' || parsed < 0.0f || parsed > 1.0f) {
    return 0;
  }

  *value = parsed;
  return 1;
}

static size_t collect_displays(CGDirectDisplayID *displays, size_t capacity) {
  uint32_t count = 0;
  CGError error = CGGetActiveDisplayList((uint32_t)capacity, displays, &count);

  if (error != kCGErrorSuccess) {
    return 0;
  }

  if (count == 0) {
    error = CGGetOnlineDisplayList((uint32_t)capacity, displays, &count);

    if (error != kCGErrorSuccess) {
      return 0;
    }
  }

  const CGDirectDisplayID main_display = CGMainDisplayID();

  for (uint32_t index = 0; index < count; index += 1) {
    if (displays[index] == main_display) {
      const CGDirectDisplayID display = displays[0];
      displays[0] = displays[index];
      displays[index] = display;
      break;
    }
  }

  return count;
}

int main(int argc, char **argv) {
  if (argc == 3 && strcmp(argv[1], "--key") == 0) {
    return post_brightness_key(argv[2]);
  }

  if (argc != 2) {
    fprintf(stderr, "usage: %s <brightness 0.0-1.0> | --key up|down\n", argv[0]);
    return 64;
  }

  float brightness = 0.0f;

  if (!parse_brightness(argv[1], &brightness)) {
    fprintf(stderr, "invalid brightness: %s\n", argv[1]);
    return 64;
  }

  void *framework = dlopen(
    "/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices",
    RTLD_LAZY
  );

  if (!framework) {
    fprintf(stderr, "failed to load DisplayServices: %s\n", dlerror());
    return 69;
  }

  DisplayServicesSetBrightnessFn set_brightness =
    (DisplayServicesSetBrightnessFn)dlsym(framework, "DisplayServicesSetBrightness");

  if (!set_brightness) {
    fprintf(stderr, "failed to find DisplayServicesSetBrightness: %s\n", dlerror());
    dlclose(framework);
    return 69;
  }

  CGDirectDisplayID displays[16] = {0};
  const size_t display_count = collect_displays(displays, 16);
  int last_result = -1;

  for (size_t index = 0; index < display_count; index += 1) {
    last_result = set_brightness(displays[index], brightness);

    if (last_result == 0) {
      dlclose(framework);
      return 0;
    }
  }

  dlclose(framework);
  fprintf(
    stderr,
    "DisplayServicesSetBrightness failed for %zu display(s), last result: %d\n",
    display_count,
    last_result
  );
  return 70;
}
